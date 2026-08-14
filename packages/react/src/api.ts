import type {
  ClientMetricsPayload,
  DebugRecord,
  DebugRecordSummary,
} from "@debugbar/core";

export class DebugRecordMissingError extends Error {
  constructor(id: string) {
    super(`Debug record ${id} was not found`);
    this.name = "DebugRecordMissingError";
  }
}

export interface DebugbarApi {
  list(signal?: AbortSignal): Promise<DebugRecordSummary[]>;
  get(id: string, signal?: AbortSignal): Promise<DebugRecord>;
  report?(id: string, payload: ClientMetricsPayload): Promise<void>;
}

export function createDebugbarApi(
  endpoint = "/__debugbar",
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
): DebugbarApi {
  const base = endpoint.replace(/\/$/, "");
  return {
    async list(signal) {
      const response = await fetcher(
        `${base}/requests`,
        signal ? { signal } : undefined,
      );
      if (!response.ok)
        throw new Error(`Unable to list debug records (${response.status})`);
      return (await response.json()) as DebugRecordSummary[];
    },
    async get(id, signal) {
      const response = await fetcher(
        `${base}/requests/${encodeURIComponent(id)}`,
        signal ? { signal } : undefined,
      );
      if (response.status === 404) throw new DebugRecordMissingError(id);
      if (!response.ok)
        throw new Error(`Unable to load debug record (${response.status})`);
      return (await response.json()) as DebugRecord;
    },
    async report(id, payload) {
      const response = await fetcher(
        `${base}/client-metrics/${encodeURIComponent(id)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debugbar-ID": id,
          },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok)
        throw new Error(`Unable to report client metrics (${response.status})`);
    },
  };
}
