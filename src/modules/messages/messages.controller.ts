import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { UserId } from '../../common/decorators/user-id.decorator';
import { UpdateMessageDto } from './dto/update-message.dto';
import { IdempotencyService } from '../idempotency/idempotency.service';

@Controller('messages')
export class MessagesController {
  constructor(
    private svc: MessagesService,
    private idem: IdempotencyService,
  ) {}

  @Get(':conversationId')
  list(
    @Param('conversationId') cid: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 30,
  ) {
    return this.svc.list(cid, cursor, Number(limit));
  }

  @Post()
  async send(
    @UserId() userId: string,
    @Body() dto: SendMessageDto,
    @Headers('Idempotency-Key') key?: string,
  ) {
    if (!key) {
      // Không có key -> chạy bình thường (giữ nguyên hành vi cũ)
      return this.svc.send(userId, dto);
    }
    // Có key -> chống trùng
    return this.idem.run(key, () => this.svc.send(userId, dto));
  }

  // ====== NEW: Edit ======
  @Patch(':id')
  edit(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.svc.edit(userId, id, dto);
  }

  // ====== NEW: Soft delete ======
  @Delete(':id')
  delete(@UserId() userId: string, @Param('id') id: string) {
    return this.svc.softDelete(userId, id);
  }

  @Get('thread/:parentId')
  thread(
    @Param('parentId') parentId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 30,
  ) {
    // trả theo thời gian tăng dần để hiển thị tự nhiên
    return this.svc.thread(parentId, cursor, Number(limit));
  }
}
