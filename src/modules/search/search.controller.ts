import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly svc: SearchService) {}

  @Get('messages')
  messages(
    @Query('q') q: string,
    @Query('conversationId') conversationId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const lim = limit ? Number(limit) : undefined;
    const off = offset ? Number(offset) : undefined;
    return this.svc.searchMessages(q ?? '', {
      conversationId,
      limit: lim,
      offset: off,
    });
  }
}
