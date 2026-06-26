import type { ZodType } from "zod";

/**
 * The only I/O boundary to storage. SINGLE WRITER: the scheduled engine is the
 * only writer to these keys, so there are no concurrent-write races (SPEC §2).
 * readJson returns the fallback for a missing key (first run) or invalid data,
 * so corrupt state never breaks a run.
 */
export interface Store {
  readJson<T>(key: string, schema: ZodType<T>, fallback: T): Promise<T>;
  writeJson(key: string, value: unknown, cacheControl: string): Promise<void>;
}
