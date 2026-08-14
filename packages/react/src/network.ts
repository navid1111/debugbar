export type DebugIdListener = (id: string) => void;

interface FetchTarget {
  fetch: typeof fetch;
}

interface FetchEntry {
  original: typeof fetch;
  listeners: Map<DebugIdListener, number>;
  endpoint: string;
}

const fetchEntries = new WeakMap<object, FetchEntry>();

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function installFetchDiscovery(
  onRequest: DebugIdListener,
  options: { endpoint?: string; target?: FetchTarget } = {},
): () => void {
  const target = options.target ?? globalThis;
  const endpoint = (options.endpoint ?? "/__debugbar").replace(/\/$/, "");
  let entry = fetchEntries.get(target);
  if (!entry) {
    const original = target.fetch;
    entry = { original, listeners: new Map(), endpoint };
    const activeEntry = entry;
    target.fetch = (async (...arguments_: Parameters<typeof fetch>) => {
      const response = await activeEntry.original.call(target, ...arguments_);
      if (!requestUrl(arguments_[0]).includes(activeEntry.endpoint)) {
        const id = response.headers.get("X-Debugbar-ID");
        if (id)
          for (const listener of activeEntry.listeners.keys()) listener(id);
      }
      return response;
    }) as typeof fetch;
    fetchEntries.set(target, entry);
  }
  entry.listeners.set(onRequest, (entry.listeners.get(onRequest) ?? 0) + 1);
  let cleaned = false;
  return () => {
    if (cleaned || !entry) return;
    cleaned = true;
    const count = entry.listeners.get(onRequest) ?? 0;
    if (count <= 1) entry.listeners.delete(onRequest);
    else entry.listeners.set(onRequest, count - 1);
    if (entry.listeners.size === 0) {
      target.fetch = entry.original;
      fetchEntries.delete(target);
    }
  };
}

interface AxiosResponseLike {
  headers?: unknown;
}

interface AxiosLike {
  interceptors: {
    response: {
      use(
        fulfilled: (response: any) => any,
        rejected: (error: any) => any,
      ): number;
      eject(id: number): void;
    };
  };
}

function axiosDebugId(
  response: AxiosResponseLike | undefined,
): string | undefined {
  if (!response?.headers) return undefined;
  const headers = response.headers as {
    get?: (name: string) => unknown;
    [key: string]: unknown;
  };
  const value =
    headers.get?.("x-debugbar-id") ??
    headers["x-debugbar-id"] ??
    headers["X-Debugbar-ID"];
  return typeof value === "string" ? value : undefined;
}

export function installAxiosDiscovery(
  axios: AxiosLike,
  onRequest: DebugIdListener,
  seen = new Set<string>(),
): () => void {
  const report = (response: AxiosResponseLike | undefined) => {
    const id = axiosDebugId(response);
    if (id && !seen.has(id)) {
      seen.add(id);
      onRequest(id);
    }
  };
  const interceptor = axios.interceptors.response.use(
    (response) => {
      report(response);
      return response;
    },
    (error: unknown) => {
      if (error && typeof error === "object" && "response" in error) {
        report((error as { response?: AxiosResponseLike }).response);
      }
      return Promise.reject(error);
    },
  );
  return () => axios.interceptors.response.eject(interceptor);
}
