import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PresenceService } from '../modules/presence/presence.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class MessagingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  constructor(private presence: PresenceService) {}

  async handleConnection(client: Socket) {
    const userId = client.handshake.auth?.userId;
    if (!userId) return client.disconnect(true);
    await this.presence.heartbeat(userId); // online ngay khi connect
    client.join(`u:${userId}`);
  }

  async handleDisconnect(client: Socket) {
    const userId = client.handshake.auth?.userId;
    if (userId) await this.presence.setLastSeen(userId);
  }

  @SubscribeMessage('join.conversation')
  joinConversation(
    @MessageBody() body: any,
    @ConnectedSocket() client: Socket,
  ) {
    if (body?.conversationId) client.join(`c:${body.conversationId}`);
  }

  // Client có thể gửi heartbeat qua WS thay vì REST
  @SubscribeMessage('presence.heartbeat')
  async wsHeartbeat(@MessageBody() _b: any, @ConnectedSocket() client: Socket) {
    const userId = client.handshake.auth?.userId;
    if (userId) await this.presence.heartbeat(userId);
  }

  emitToConversation(conversationId: string, event: string, payload: any) {
    this.server.to(`c:${conversationId}`).emit(event, payload);
  }
}
