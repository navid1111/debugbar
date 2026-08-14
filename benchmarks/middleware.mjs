import { EventEmitter } from "node:events";
import console from "node:console";
import os from "node:os";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { createDebugbar } from "../packages/express/dist/index.js";

const iterations = Math.max(
  100,
  Number(process.env.BENCHMARK_ITERATIONS ?? 5_000),
);
const warmup = Math.max(10, Number(process.env.BENCHMARK_WARMUP ?? 500));
const tolerance = Math.max(1, Number(process.env.BENCHMARK_TOLERANCE ?? 1.5));
const budgets = { disabled: 0.1, enabled: 2 };

class Response extends EventEmitter {
  statusCode = 200;
  writableFinished = true;
  #headers = new Map();
  setHeader(name, value) {
    this.#headers.set(name.toLowerCase(), value);
  }
  getHeader(name) {
    return this.#headers.get(name.toLowerCase());
  }
  writeHead() {
    return this;
  }
}

function request() {
  return {
    method: "GET",
    originalUrl: "/benchmark",
    path: "/benchmark",
    headers: {},
    query: {},
    params: {},
    route: { path: "/benchmark" },
    get() {
      return undefined;
    },
  };
}

function percentile(values, percentileValue) {
  const index = Math.min(
    values.length - 1,
    Math.ceil((percentileValue / 100) * values.length) - 1,
  );
  return values[index];
}

function summary(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

function controlSample() {
  const response = new Response();
  const startedAt = performance.now();
  response.emit("finish");
  return performance.now() - startedAt;
}

async function middlewareSample(middleware, completion) {
  const response = new Response();
  const startedAt = performance.now();
  await new Promise((resolve, reject) => {
    completion.waiting = () => {
      completion.elapsed = performance.now() - startedAt;
      resolve();
    };
    try {
      middleware(request(), response, () => {
        response.emit("finish");
        if (!completion.enabled) completion.waiting?.();
      });
    } catch (error) {
      reject(error);
    }
  });
  return completion.elapsed ?? performance.now() - startedAt;
}

function benchmarkMiddleware(enabled) {
  const completion = { enabled, elapsed: undefined, waiting: undefined };
  const store = {
    async put() {
      completion.waiting?.();
    },
    async get() {
      return undefined;
    },
    async list() {
      return [];
    },
    async clear() {},
  };
  const debugbar = createDebugbar({ enabled, access: () => true, store });
  return { middleware: debugbar.middleware(), completion };
}

async function collect(mode, count) {
  if (mode === "control") return Array.from({ length: count }, controlSample);
  const { middleware, completion } = benchmarkMiddleware(mode === "enabled");
  const values = [];
  for (let index = 0; index < count; index += 1) {
    completion.elapsed = undefined;
    completion.waiting = undefined;
    values.push(await middlewareSample(middleware, completion));
  }
  return values;
}

for (const mode of ["control", "disabled", "enabled"])
  await collect(mode, warmup);
const results = {};
for (const mode of ["control", "disabled", "enabled"])
  results[mode] = summary(await collect(mode, iterations));

const overhead = {};
for (const mode of ["disabled", "enabled"]) {
  overhead[mode] = Object.fromEntries(
    ["p50", "p95", "p99"].map((key) => [
      key,
      Math.max(0, results[mode][key] - results.control[key]),
    ]),
  );
}

const metadata = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpu: os.cpus()[0]?.model ?? "unknown",
  logicalCpus: os.cpus().length,
  iterations,
  warmup,
  tolerance,
  timestamp: new Date().toISOString(),
};
console.log(
  JSON.stringify(
    {
      metadata,
      latencyMs: results,
      overheadMs: overhead,
      budgetsP95Ms: budgets,
    },
    null,
    2,
  ),
);
console.table(
  ["control", "disabled", "enabled"].map((mode) => ({
    mode,
    ...results[mode],
    overheadP95: overhead[mode]?.p95 ?? 0,
  })),
);

const failures = Object.entries(budgets).filter(
  ([mode, budget]) => overhead[mode].p95 > budget * tolerance,
);
if (failures.length) {
  console.error(
    `Benchmark budget exceeded: ${failures.map(([mode, budget]) => `${mode} p95 ${overhead[mode].p95.toFixed(3)} ms > ${(budget * tolerance).toFixed(3)} ms`).join(", ")}`,
  );
  process.exitCode = 1;
}
