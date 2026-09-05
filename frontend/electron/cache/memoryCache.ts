export class MemoryCache {
  private cache: Map<string, any>;

  constructor() {
    this.cache = new Map();
  }

  // Generate composite keys like "users:123"
  private getKey(entityType: string, id: string): string {
    return `${entityType}:${id}`;
  }

  get(entityType: string, id: string): any {
    return this.cache.get(this.getKey(entityType, id));
  }

  set(entityType: string, id: string, data: any): void {
    const key = this.getKey(entityType, id);
    const existing = this.cache.get(key);
    
    // Only update cache if new data has higher or equal version, OR if it's new
    if (!existing || data.version >= existing.version) {
      this.cache.set(key, data);
    }
  }

  delete(entityType: string, id: string): void {
    this.cache.delete(this.getKey(entityType, id));
  }

  clear(): void {
    this.cache.clear();
  }
}

export const memoryCache = new MemoryCache();
