import { Injectable } from '@nestjs/common';
import { S3, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../../common/prisma/prisma.service';
import { randomUUID } from 'crypto';

@Injectable()
export class FilesService {
  private readonly bucket = process.env.R2_BUCKET!;
  private readonly s3 = new S3({
    endpoint: process.env.R2_S3_ENDPOINT, // https://<account>.r2.cloudflarestorage.com
    region: process.env.R2_REGION || 'auto', // R2 yêu cầu 'auto'
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    // KHÔNG set forcePathStyle cho R2
  });

  constructor(private prisma: PrismaService) {}

  /**
   * Tạo record file (status=UPLOADING) + Presigned POST để client upload trực tiếp.
   */
  async presign(filename: string, mime: string, sizeMax = 25 * 1024 * 1024) {
    const fileId = randomUUID();
    const key = `uploads/${fileId}/${filename}`;

    await this.prisma.fileObject.create({
      data: {
        id: fileId,
        bucket: this.bucket,
        key,
        mime,
        status: 'UPLOADING' as any,
      },
    });

    const { url, fields } = await createPresignedPost(this.s3 as any, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 0, sizeMax],
        ['eq', '$Content-Type', mime],
      ],
      Expires: 600, // 10 phút
    });

    return { fileId, bucket: this.bucket, key, url, fields, expiresIn: 600 };
  }

  /**
   * Sau khi upload xong, HEAD object để lấy size rồi mark READY.
   */
  async complete(fileId: string) {
    const f = await this.prisma.fileObject.findUnique({
      where: { id: fileId },
    });
    if (!f) throw new Error('file not found');

    const head = await this.s3.send(
      new HeadObjectCommand({ Bucket: f.bucket, Key: f.key }),
    );
    const size = Number(head.ContentLength ?? 0);

    return this.prisma.fileObject.update({
      where: { id: fileId },
      data: { status: 'READY' as any, size },
    });
  }

  /**
   * (Tuỳ chọn) Tạo presigned GET để tải file private
   */
  async presignGet(key: string, expiresIn = 600) {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(this.s3, cmd, { expiresIn });
    return { url, expiresIn };
  }
}
