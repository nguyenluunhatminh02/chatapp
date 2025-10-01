import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  S3,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../../common/prisma/prisma.service';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';

const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'video/mp4',
];

async function streamToBuffer(stream: any): Promise<Buffer> {
  if (!stream) return Buffer.alloc(0);
  if (typeof stream.transformToByteArray === 'function') {
    const arr = await stream.transformToByteArray();
    return Buffer.from(arr);
  }
  const chunks: Buffer[] = [];
  return await new Promise((resolve, reject) => {
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

@Injectable()
export class FilesService {
  private readonly bucket = process.env.R2_BUCKET!;
  private readonly s3 = new S3({
    endpoint: process.env.R2_S3_ENDPOINT,
    region: process.env.R2_REGION || 'auto',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  constructor(private prisma: PrismaService) {}

  /** Presigned POST + guard mime khai báo */
  async presign(filename: string, mime: string, sizeMax = 25 * 1024 * 1024) {
    if (!ALLOWED_MIMES.includes(mime)) {
      throw new BadRequestException(`Mime không được phép: ${mime}`);
    }

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
      Expires: 600,
    });

    return { fileId, bucket: this.bucket, key, url, fields, expiresIn: 600 };
  }

  /** Mimetype guard: HEAD + đọc 128KB đầu để sniff → mới mark READY */
  async complete(fileId: string) {
    const f = await this.prisma.fileObject.findUnique({
      where: { id: fileId },
    });
    if (!f) throw new NotFoundException('file not found');

    // Lấy size
    const head = await this.s3.send(
      new HeadObjectCommand({ Bucket: f.bucket, Key: f.key }),
    );
    const size = Number(head.ContentLength ?? 0);

    // Sniff mime bằng 128KB đầu (đủ cho đa số định dạng)
    const part = await this.s3.send(
      new GetObjectCommand({
        Bucket: f.bucket,
        Key: f.key,
        Range: 'bytes=0-131071',
      }),
    );
    const buf = await streamToBuffer(part.Body as any);
    const sniff = await fileTypeFromBuffer(buf);

    // Nếu sniff nhận diện được → so với mime khai báo và whitelist
    if (sniff?.mime) {
      if (!ALLOWED_MIMES.includes(sniff.mime)) {
        // cleanup object nếu muốn
        await this.s3.send(
          new DeleteObjectCommand({ Bucket: f.bucket, Key: f.key }),
        );
        throw new BadRequestException(`File type không hợp lệ: ${sniff.mime}`);
      }
      // Nếu mime khai báo khác thực tế, cập nhật mime về thật để nhất quán
      if (f.mime !== sniff.mime) {
        await this.prisma.fileObject.update({
          where: { id: fileId },
          data: { mime: sniff.mime },
        });
      }
    } else {
      // Không nhận diện được → chỉ cho phép nếu mime khai báo trong whitelist
      if (!ALLOWED_MIMES.includes(f.mime)) {
        await this.s3.send(
          new DeleteObjectCommand({ Bucket: f.bucket, Key: f.key }),
        );
        throw new BadRequestException(
          `File không nhận diện được định dạng an toàn`,
        );
      }
    }

    return this.prisma.fileObject.update({
      where: { id: fileId },
      data: { status: 'READY' as any, size },
    });
  }

  /** Presigned GET (private) */
  async presignGet(key: string, expiresIn = 600) {
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn },
    );
    return { url, expiresIn };
  }

  /** NEW: Tạo thumbnail cho ảnh (jpeg/png/webp/gif) */
  async createThumbnail(fileId: string, maxSize = 512) {
    const f = await this.prisma.fileObject.findUnique({
      where: { id: fileId },
    });
    if (!f) throw new NotFoundException('file not found');
    if (f.status !== 'READY') throw new ConflictException('File chưa READY');

    if (
      !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(f.mime)
    ) {
      throw new BadRequestException(
        `Chỉ tạo thumbnail cho ảnh, mime hiện tại: ${f.mime}`,
      );
    }

    // Tải full (ảnh thường không lớn). Nếu muốn tối ưu, có thể streaming + limit
    const obj = await this.s3.send(
      new GetObjectCommand({ Bucket: f.bucket, Key: f.key }),
    );
    const buf = await streamToBuffer(obj.Body as any);

    const img = sharp(buf).rotate(); // auto-rotate theo EXIF
    const meta = await img.metadata();
    const resized = await img
      .resize({
        width: maxSize,
        height: maxSize,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    const thumbKey = `${f.key}.thumb.jpg`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: f.bucket,
        Key: thumbKey,
        Body: resized,
        ContentType: 'image/jpeg',
      }),
    );

    const width = meta.width ?? null;
    const height = meta.height ?? null;

    const updated = await this.prisma.fileObject.update({
      where: { id: fileId },
      data: {
        thumbKey,
        width: width ?? undefined,
        height: height ?? undefined,
      },
    });

    const thumbUrl = await this.presignGet(thumbKey).then((x) => x.url);
    return { ...updated, thumbUrl };
  }

  /** NEW: Xoá file (force=1 để xoá cả khi đã attach) */
  async deleteFile(fileId: string, force = false) {
    const f = await this.prisma.fileObject.findUnique({
      where: { id: fileId },
      include: { attachments: { select: { id: true } } },
    });
    if (!f) throw new NotFoundException('file not found');

    if (f.attachments.length > 0 && !force) {
      throw new ConflictException(
        'File đang được gắn vào message, thêm ?force=1 để xoá',
      );
    }

    // Xoá object chính + thumbnail nếu có
    await this.s3
      .send(new DeleteObjectCommand({ Bucket: f.bucket, Key: f.key }))
      .catch(() => undefined);
    if (f.thumbKey) {
      await this.s3
        .send(new DeleteObjectCommand({ Bucket: f.bucket, Key: f.thumbKey }))
        .catch(() => undefined);
    }

    // Nếu force: xoá cả Attachment (cascade đã thiết lập trong schema)
    await this.prisma.fileObject.delete({ where: { id: fileId } });

    return { ok: true, deleted: fileId };
  }
}
