import type { DebugRecord, DebugRecordSummary } from "@debugbar/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createDebugbarApi, DebugRecordMissingError } from "./api.js";
import type { DebugbarApi } from "./api.js";
import { installFetchDiscovery } from "./network.js";

export type RecordLoadState =
  | { status: "idle" }
  | { status: "loading"; id: string }
  | { status: "ready"; id: string; record: DebugRecord }
  | { status: "missing"; id: string }
  | { status: "error"; id: string; error: Error };

export interface DebugbarContextValue {
  summaries: DebugRecordSummary[];
  selected: RecordLoadState;
  select(id: string): Promise<void>;
  discover(id: string): void;
  refresh(): Promise<void>;
}

const DebugbarContext = createContext<DebugbarContextValue | undefined>(
  undefined,
);

function summary(record: DebugRecord): DebugRecordSummary {
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

export interface DebugbarProviderProps {
  children: ReactNode;
  endpoint?: string;
  api?: DebugbarApi;
  autoDiscover?: boolean;
  maxCache?: number;
}

export function DebugbarProvider({
  children,
  endpoint = "/__debugbar",
  api: suppliedApi,
  autoDiscover = true,
  maxCache = 50,
}: DebugbarProviderProps) {
  const api = useMemo(
    () => suppliedApi ?? createDebugbarApi(endpoint),
    [endpoint, suppliedApi],
  );
  const [summaries, setSummaries] = useState<DebugRecordSummary[]>([]);
  const [selected, setSelected] = useState<RecordLoadState>({ status: "idle" });
  const cache = useRef(new Map<string, DebugRecord>());
  const sequence = useRef(0);
  const initialized = useRef(false);

  const addRecord = useCallback(
    (record: DebugRecord) => {
      cache.current.delete(record.id);
      cache.current.set(record.id, record);
      while (cache.current.size > maxCache) {
        const oldest = cache.current.keys().next().value as string | undefined;
        if (!oldest) break;
        cache.current.delete(oldest);
      }
      setSummaries((current) => [
        summary(record),
        ...current.filter(({ id }) => id !== record.id),
      ]);
    },
    [maxCache],
  );

  const select = useCallback(
    async (id: string) => {
      const requestSequence = ++sequence.current;
      const cached = cache.current.get(id);
      if (cached) {
        setSelected({ status: "ready", id, record: cached });
        return;
      }
      setSelected({ status: "loading", id });
      try {
        const record = await api.get(id);
        if (requestSequence !== sequence.current) return;
        addRecord(record);
        setSelected({ status: "ready", id, record });
      } catch (error) {
        if (requestSequence !== sequence.current) return;
        if (error instanceof DebugRecordMissingError)
          setSelected({ status: "missing", id });
        else
          setSelected({
            status: "error",
            id,
            error: error instanceof Error ? error : new Error(String(error)),
          });
      }
    },
    [addRecord, api],
  );

  const discover = useCallback(
    (id: string) => {
      if (cache.current.has(id)) return;
      void select(id);
    },
    [select],
  );

  const refresh = useCallback(async () => {
    const records = await api.list();
    setSummaries(records.slice(0, maxCache));
  }, [api, maxCache]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void refresh().catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (!autoDiscover) return;
    return installFetchDiscovery(discover, { endpoint });
  }, [autoDiscover, discover, endpoint]);

  const value = useMemo(
    () => ({ summaries, selected, select, discover, refresh }),
    [discover, refresh, select, selected, summaries],
  );
  return (
    <DebugbarContext.Provider value={value}>
      {children}
    </DebugbarContext.Provider>
  );
}

export function useDebugbar(): DebugbarContextValue {
  const value = useContext(DebugbarContext);
  if (!value)
    throw new Error("useDebugbar must be used inside DebugbarProvider");
  return value;
}
