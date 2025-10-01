import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SendMessageDto } from './dto/send-message.dto';
import { MessagingGateway } from '../../websockets/messaging.gateway';
import { UpdateMessageDto } from './dto/update-message.dto';

@Injectable()
export class MessagesService {
  constructor(
    private prisma: PrismaService,
    private gateway: MessagingGateway,
  ) {}

  async list(conversationId: string, cursor?: string, limit = 30) {
    return this.prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async send(userId: string, dto: SendMessageDto) {
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId: dto.conversationId, userId },
      },
      select: { id: true },
    });
    if (!member) throw new ForbiddenException('Not a member');

    // ✅ Nếu là reply thì kiểm tra parent hợp lệ
    if (dto.parentId) {
      const parent = await this.prisma.message.findUnique({
        where: { id: dto.parentId },
        select: { conversationId: true },
      });
      if (!parent || parent.conversationId !== dto.conversationId) {
        throw new ForbiddenException('Invalid parent message');
      }
    }

    const [msg] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId: dto.conversationId,
          senderId: userId,
          type: dto.type as any,
          content: dto.content ?? null,
          parentId: dto.parentId ?? null,
        },
      }),
      this.prisma.conversation.update({
        where: { id: dto.conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);

    this.gateway.emitToConversation(dto.conversationId, 'message.created', {
      message: msg,
    });
    return msg;
  }

  async thread(parentId: string, cursor?: string, limit = 30) {
    return await this.prisma.message.findMany({
      where: { parentId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  // ====== NEW: Edit message ======
  async edit(userId: string, messageId: string, dto: UpdateMessageDto) {
    if (!dto.content?.trim()) throw new BadRequestException('Content required');

    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        senderId: true,
        conversationId: true,
        deletedAt: true,
      },
    });
    if (!msg) throw new NotFoundException('Message not found');

    // chỉ cho chính người gửi sửa
    if (msg.senderId !== userId)
      throw new ForbiddenException('Only sender can edit');
    if (msg.deletedAt) throw new BadRequestException('Message already deleted');

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: dto.content, editedAt: new Date() },
    });

    this.gateway.emitToConversation(msg.conversationId, 'message.updated', {
      id: updated.id,
      content: updated.content,
      editedAt: updated.editedAt,
    });

    return updated;
  }

  // ====== NEW: Soft delete ======
  async softDelete(userId: string, messageId: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        senderId: true,
        conversationId: true,
        deletedAt: true,
      },
    });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.deletedAt) return msg; // idempotent

    // cho phép: chính sender hoặc member có role ADMIN/OWNER
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId: msg.conversationId, userId },
      },
      select: { role: true },
    });
    if (!member) throw new ForbiddenException('Not a member');

    const isSender = msg.senderId === userId;
    const canAdmin = member.role === 'ADMIN' || member.role === 'OWNER';
    if (!isSender && !canAdmin)
      throw new ForbiddenException('No permission to delete');

    const deleted = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), content: null }, // xóa nội dung hiển thị
    });

    this.gateway.emitToConversation(msg.conversationId, 'message.deleted', {
      id: deleted.id,
      deletedAt: deleted.deletedAt,
    });

    return deleted;
  }
}
