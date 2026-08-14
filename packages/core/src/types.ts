export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface DebugMessage {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  context?: JsonValue;
  timestamp: string;
}

export interface DebugMeasure {
  name: string;
  startedAtMs: number;
  durationMs: number;
  failed?: boolean;
}

export interface DatabaseQueryEvent {
  operation: string;
  statement: string;
  parameters?: JsonValue;
  durationMs: number;
  connection?: string;
  success: boolean;
  error?: string;
}

export interface DatabaseAdapter {
  install(onQuery: (event: DatabaseQueryEvent) => void): () => void;
}

export type ClientMetricCategory =
  | "navigation"
  | "network-error"
  | "web-vital"
  | "react-profiler";

export interface ClientMetric {
  category: ClientMetricCategory;
  name: string;
  value: number;
  unit: "ms" | "count" | "score";
  timestamp?: number;
  detail?: JsonValue;
}

export interface ClientMetricsPayload {
  schemaVersion: 1;
  metrics: ClientMetric[];
}

export interface DebugError {
  name: string;
  message: string;
  stack?: string;
  timestamp: string;
  cause?: DebugError;
}

export interface DebugRecord {
  schemaVersion: 1;
  id: string;
  startedAt: string;
  durationMs: number;
  request: {
    method: string;
    url: string;
    route?: string;
    status: number;
    aborted: boolean;
  };
  collectors: Record<string, JsonValue>;
  warnings: Array<{ source: string; message: string }>;
}

export interface DebugRecordSummary {
  id: string;
  startedAt: string;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  errorCount: number;
}

export interface ListOptions {
  limit?: number;
  before?: string;
}

export interface DebugbarStore {
  put(record: DebugRecord): Promise<void>;
  get(id: string): Promise<DebugRecord | undefined>;
  list(options?: ListOptions): Promise<DebugRecordSummary[]>;
  clear(): Promise<void>;
}

export interface CollectorRequestInput {
  method: string;
  url: string;
}

export interface CollectorResponseInput {
  status: number;
  aborted: boolean;
}

export interface Collector<TState = unknown, TOutput = JsonValue> {
  name: string;
  createState(): TState;
  onRequest?(input: CollectorRequestInput, state: TState): void | Promise<void>;
  onResponse?(
    input: CollectorResponseInput,
    state: TState,
  ): void | Promise<void>;
  collect(state: TState): TOutput | Promise<TOutput>;
}

export interface SanitizationLimits {
  maxDepth: number;
  maxArrayLength: number;
  maxStringLength: number;
  maxCollectorBytes: number;
  maxRecordBytes: number;
}

export interface DebugbarOptions {
  enabled?: boolean;
  routePrefix?: string;
  access?: (request: unknown) => boolean | Promise<boolean>;
  store?: DebugbarStore;
  collectors?: Collector[];
  maxRequests?: number;
  retentionMs?: number;
  captureBody?: boolean;
  maskedKeys?: string[];
  limits?: Partial<SanitizationLimits>;
  cors?: { origins: string[]; exposeHeaders?: boolean };
}

export interface ResolvedDebugbarOptions {
  enabled: boolean;
  routePrefix: string;
  access: (request: unknown) => boolean | Promise<boolean>;
  store?: DebugbarStore;
  collectors: Collector[];
  maxRequests: number;
  retentionMs: number;
  captureBody: boolean;
  maskedKeys: string[];
  limits: SanitizationLimits;
  cors?: { origins: string[]; exposeHeaders: boolean };
}
