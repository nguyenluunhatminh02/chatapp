import { Module } from '@nestjs/common';
import { OutboxProducer } from './outbox.producer';
import { OutboxRelay } from './outbox.relay';
import { MessagingGateway } from 'src/websockets/messaging.gateway';
import { PresenceService } from '../presence/presence.service';
import { SearchService } from '../search/search.service';

@Module({
  providers: [
    OutboxProducer,
    OutboxRelay,
    MessagingGateway,
    PresenceService,
    SearchService,
  ],
  exports: [OutboxProducer],
})
export class OutboxModule {}
