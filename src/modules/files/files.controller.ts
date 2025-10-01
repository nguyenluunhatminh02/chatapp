import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { CompleteDto } from './dto/complete.dto';
import { PresignDto } from './dto/presign.dto';
import { ThumbnailDto } from './dto/thumbnail.dto';

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

  // tải private bằng presigned GET
  @Get('presign-get')
  presignGet(
    @Query('key') key: string,
    @Query('expiresIn') expiresIn?: string,
  ) {
    return this.svc.presignGet(key, expiresIn ? Number(expiresIn) : 600);
  }

  // NEW: tạo thumbnail
  @Post('thumbnail')
  thumbnail(@Body() dto: ThumbnailDto) {
    return this.svc.createThumbnail(dto.fileId, dto.maxSize ?? 512);
  }

  // NEW: xoá file (force=1 để xoá cả khi đang gắn với message)
  @Delete(':fileId')
  remove(@Param('fileId') fileId: string, @Query('force') force?: string) {
    return this.svc.deleteFile(fileId, force === '1' || force === 'true');
  }
}
