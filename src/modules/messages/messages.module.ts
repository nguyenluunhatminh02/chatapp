import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { MessagingGateway } from 'src/websockets/messaging.gateway';
import { PresenceService } from '../presence/presence.service';
import { IdempotencyService } from '../idempotency/idempotency.service';

@Module({
  providers: [
    MessagesService,
    MessagingGateway,
    PresenceService,
    IdempotencyService,
  ],
  controllers: [MessagesController],
})
export class MessagesModule {}
