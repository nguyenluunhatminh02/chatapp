import { Injectable, OnModuleInit } from '@nestjs/common';
import { MeiliSearch } from 'meilisearch';

export type SearchableMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content: string | null;
  createdAt: string; // ISO
};

@Injectable()
export class SearchService implements OnModuleInit {
  private client = new MeiliSearch({
    host: process.env.MEILI_HOST!,
    apiKey: process.env.MEILI_API_KEY!,
  });
  private indexName = process.env.MEILI_INDEX_MESSAGES || 'messages';

  async onModuleInit() {
    // tạo index nếu chưa có + cấu hình attributes
    const idx = await this.client.index(this.indexName);
    try {
      await this.client.getIndex(this.indexName);
    } catch {
      await this.client.createIndex(this.indexName, { primaryKey: 'id' });
    }
    await idx.updateSettings({
      searchableAttributes: ['content'],
      filterableAttributes: ['conversationId', 'senderId', 'type', 'createdAt'],
      sortableAttributes: ['createdAt'],
      typoTolerance: { enabled: true },
    });
  }

  async indexMessage(doc: SearchableMessage) {
    // chỉ index khi có content (TEXT/caption). FILE/IMAGE không content thì bỏ qua
    if (!doc.content || !doc.content.trim()) return;
    await this.client
      .index(this.indexName)
      .addDocuments([doc], { primaryKey: 'id' });
  }

  async removeMessage(id: string) {
    await this.client
      .index(this.indexName)
      .deleteDocument(id)
      .catch(() => {});
  }

  async searchMessages(
    q: string,
    opts?: { conversationId?: string; limit?: number; offset?: number },
  ) {
    const filters: string[] = [];
    if (opts?.conversationId)
      filters.push(`conversationId = "${opts.conversationId}"`);

    const res = await this.client.index(this.indexName).search(q, {
      limit: opts?.limit ?? 20,
      offset: opts?.offset ?? 0,
      filter: filters.length ? filters.join(' AND ') : undefined,
      attributesToHighlight: ['content'],
      highlightPreTag: '<mark>',
      highlightPostTag: '</mark>',
      sort: ['createdAt:desc'],
    });

    return {
      query: q,
      limit: res.limit,
      offset: res.offset,
      estimatedTotalHits: res.estimatedTotalHits,
      hits: res.hits.map((h: any) => ({
        id: h.id,
        conversationId: h.conversationId,
        senderId: h.senderId,
        type: h.type,
        content: h.content,
        createdAt: h.createdAt,
        highlight: h._formatted?.content ?? null,
      })),
    };
  }
}
