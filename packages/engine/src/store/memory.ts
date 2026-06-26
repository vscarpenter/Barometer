import type { ZodType } from "zod";
import type { Store } from "./types.js";

/** In-memory Store for tests and dry-run. */
export class MemoryStore implements Store {
  private readonly data = new Map<string, string>();

  async readJson<T>(key: string, schema: ZodType<T>, fallback: T): Promise<T> {
    const raw = this.data.get(key);
    if (raw === undefined) return fallback;
    try {
      return schema.parse(JSON.parse(raw));
    } catch {
      return fallback;
    }
  }

  async writeJson(key: string, value: unknown, _cacheControl: string): Promise<void> {
    this.data.set(key, JSON.stringify(value));
  }
}
