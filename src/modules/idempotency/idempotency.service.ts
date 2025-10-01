import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../../common/prisma/prisma.service';

type Worker<T> = () => Promise<T>;

@Injectable()
export class IdempotencyService {
  constructor(private prisma: PrismaService) {}

  /**
   * Đảm bảo worker() chỉ chạy 1 lần cho mỗi key.
   * - Nếu key mới: set IN_PROGRESS -> chạy -> set COMPLETED + response.
   * - Nếu đã COMPLETED: trả lại response cũ.
   * - Nếu đang IN_PROGRESS: ném 409 để client retry sau.
   */
  async run<T = any>(key: string, worker: Worker<T>): Promise<T> {
    // 1) Thử tạo bản ghi mới -> nếu đụng unique key => đã có yêu cầu trước đó
    try {
      await this.prisma.idempotency.create({
        data: { key, status: 'IN_PROGRESS' },
      });
    } catch (e: any) {
      // P2002 = unique violation
      if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
        const exist = await this.prisma.idempotency.findUnique({
          where: { key },
        });
        if (exist?.status === 'COMPLETED' && exist.response != null) {
          return exist.response as T; // trả lại kết quả cũ
        }
        // đang IN_PROGRESS hoặc FAILED (tuỳ ý bạn có cho chạy lại không)
        throw new ConflictException('Request in progress, please retry');
      }
      throw e;
    }

    // 2) Chúng ta là người sở hữu key này -> chạy worker
    try {
      const result = await worker();
      await this.prisma.idempotency.update({
        where: { key },
        data: { status: 'COMPLETED', response: result as any },
      });
      return result;
    } catch (err) {
      await this.prisma.idempotency.update({
        where: { key },
        data: { status: 'FAILED' },
      });
      throw err;
    }
  }
}
