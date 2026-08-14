import type {
  DebugRecord,
  DebugRecordSummary,
  DebugbarStore,
  ListOptions,
} from "./types.js";

const clone = <T>(value: T): T => structuredClone(value);

function summarize(record: DebugRecord): DebugRecordSummary {
  const errors = record.collectors.errors;
  return {
    id: record.id,
    startedAt: record.startedAt,
    method: record.request.method,
    url: record.request.url,
    status: record.request.status,
    durationMs: record.durationMs,
    errorCount: Array.isArray(errors) ? errors.length : 0,
  };
}

export class MemoryStore implements DebugbarStore {
  readonly #records = new Map<string, DebugRecord>();
  constructor(
    private readonly options: {
      maxRequests?: number;
      retentionMs?: number;
      now?: () => number;
    } = {},
  ) {}

  #now(): number {
    return (this.options.now ?? Date.now)();
  }
  #purge(): void {
    const retention = this.options.retentionMs ?? 30 * 60 * 1000;
    const cutoff = this.#now() - retention;
    for (const [id, record] of this.#records) {
      if (Date.parse(record.startedAt) < cutoff) this.#records.delete(id);
    }
  }

  async put(record: DebugRecord): Promise<void> {
    this.#purge();
    this.#records.delete(record.id);
    this.#records.set(record.id, clone(record));
    const maximum = this.options.maxRequests ?? 100;
    while (this.#records.size > maximum) {
      const oldest = this.#records.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#records.delete(oldest);
    }
  }

  async get(id: string): Promise<DebugRecord | undefined> {
    this.#purge();
    const record = this.#records.get(id);
    return record ? clone(record) : undefined;
  }

  async list(options: ListOptions = {}): Promise<DebugRecordSummary[]> {
    this.#purge();
    let records = [...this.#records.values()].reverse();
    if (options.before) {
      const index = records.findIndex((record) => record.id === options.before);
      records = index >= 0 ? records.slice(index + 1) : [];
    }
    records = records.slice(0, Math.max(0, options.limit ?? 100));
    return clone(records.map(summarize));
  }

  async clear(): Promise<void> {
    this.#records.clear();
  }
}
