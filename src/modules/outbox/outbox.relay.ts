import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MessagingGateway } from '../../websockets/messaging.gateway';
import { SearchService } from '../search/search.service';

@Injectable()
export class OutboxRelay implements OnModuleInit {
  private log = new Logger(OutboxRelay.name);
  private timer?: NodeJS.Timeout;
  private nodeId =
    process.env.INSTANCE_ID || `node-${Math.random().toString(36).slice(2, 8)}`;
  private claimTtlMs = 30_000; // reclaim nếu instance chết trong 30s

  constructor(
    private prisma: PrismaService,
    private gw: MessagingGateway,
    private search: SearchService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      () => this.tick().catch((e) => this.log.error(e)),
      500,
    );
    this.log.log(`OutboxRelay started on ${this.nodeId}`);
  }

  private reclaimFilter() {
    return {
      OR: [
        { claimedAt: null },
        { claimedAt: { lt: new Date(Date.now() - this.claimTtlMs) } }, // claim quá hạn
      ],
    };
  }

  async tick() {
    // Lấy batch chưa publish và chưa (hoặc hết hạn) claim
    const batch = await this.prisma.outbox.findMany({
      where: { publishedAt: null, ...this.reclaimFilter() },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    if (!batch.length) return;

    for (const ev of batch) {
      // 1) Try claim (atomic) — nếu count=0 => có instance khác đã claim
      const { count } = await this.prisma.outbox.updateMany({
        where: { id: ev.id, publishedAt: null, ...this.reclaimFilter() },
        data: {
          claimedAt: new Date(),
          claimedBy: this.nodeId,
          attempts: { increment: 1 },
        },
      });
      if (count === 0) continue;

      try {
        switch (ev.topic) {
          case 'messaging.message_created': {
            const { messageId, conversationId } = ev.payload as any;
            const msg = await this.prisma.message.findUnique({
              where: { id: messageId },
            });
            if (!msg) throw new Error('Message not found');
            // phát WS qua adapter (các instance khác vẫn nhận)
            this.gw.emitToConversation(conversationId, 'message.created', {
              message: msg,
            });
            // index search (nếu có content)
            if (msg.content?.trim()) {
              await this.search.indexMessage({
                id: msg.id,
                conversationId: msg.conversationId,
                senderId: msg.senderId,
                type: msg.type,
                content: msg.content,
                createdAt: msg.createdAt.toISOString(),
              });
            }
            break;
          }
          case 'messaging.message_updated': {
            const { messageId } = ev.payload as any;
            const msg = await this.prisma.message.findUnique({
              where: { id: messageId },
            });
            if (msg?.content?.trim()) {
              await this.search.indexMessage({
                id: msg.id,
                conversationId: msg.conversationId,
                senderId: msg.senderId,
                type: msg.type,
                content: msg.content,
                createdAt: msg.createdAt.toISOString(),
              });
            } else {
              await this.search.removeMessage(messageId);
            }
            break;
          }
          case 'messaging.message_deleted': {
            const { messageId } = ev.payload as any;
            await this.search.removeMessage(messageId);
            break;
          }
          default:
            // no-op
            break;
        }

        // 3) Mark published
        await this.prisma.outbox.update({
          where: { id: ev.id },
          data: { publishedAt: new Date(), lastError: null },
        });
      } catch (err: any) {
        await this.prisma.outbox.update({
          where: { id: ev.id },
          data: { lastError: String(err?.message ?? err) },
        });
      }
    }
  }
}
