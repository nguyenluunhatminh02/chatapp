import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';

export class RedisIoAdapter extends IoAdapter {
  private pubClient!: RedisClientType;
  private subClient!: RedisClientType;

  async connectToRedis(url: string) {
    this.pubClient = createClient({ url });
    this.subClient = this.pubClient.duplicate();
    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    // ép dùng websocket-only để tránh cần sticky session
    const server = super.createIOServer(port, {
      transports: ['websocket'],
      cors: { origin: '*' },
      ...(options || {}),
    });
    server.adapter(createAdapter(this.pubClient, this.subClient));
    return server;
  }
}
