import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { FilesService } from './files.service';
import { CompleteDto } from './dto/complete.dto';
import { PresignDto } from './dto/presign.dto';

@Controller('files')
export class FilesController {
  constructor(private readonly svc: FilesService) {}

  @Post('presign')
  presign(@Body() dto: PresignDto) {
    return this.svc.presign(dto.filename, dto.mime, dto.sizeMax);
  }

  @Post('complete')
  complete(@Body() dto: CompleteDto) {
    return this.svc.complete(dto.fileId);
  }

  // Tuỳ chọn: lấy link tải tạm thời cho object private
  @Get('presign-get')
  presignGet(
    @Query('key') key: string,
    @Query('expiresIn') expiresIn?: string,
  ) {
    return this.svc.presignGet(key, expiresIn ? Number(expiresIn) : 600);
  }
}
