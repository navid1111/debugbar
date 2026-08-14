import http from "node:http";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { DEBUG_ID_PATTERN } from "@debugbar/core";
import type { Collector, DebugRecord, DebugbarStore } from "@debugbar/core";
import { createDebugbar } from "./index.js";

async function waitForRecords(
  store: DebugbarStore,
  count = 1,
): Promise<DebugRecord[]> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const summaries = await store.list();
    if (summaries.length >= count) {
      return Promise.all(
        summaries.map(async ({ id }) => (await store.get(id))!),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`Timed out waiting for ${count} debug records`);
}

function application(options: Parameters<typeof createDebugbar>[0] = {}) {
  const debugbar = createDebugbar({ access: () => true, ...options });
  const app = express();
  app.use(debugbar.middleware());
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.get("/ok/:id", (req, res) => {
    req.debugbar?.info("hello", { password: "hidden", safe: req.params.id });
    const stop = req.debugbar?.startMeasure("route");
    stop?.();
    res.setHeader("Server-Timing", "db;dur=2");
    res.json({ ok: true });
  });
  app.post("/echo", (req, res) => res.json({ accepted: true }));
  app.post("/binary", (req, res) => res.sendStatus(204));
  app.get("/throw", () => {
    throw new Error("private failure", { cause: new Error("root cause") });
  });
  app.get("/primitive", () => {
    throw "primitive failure";
  });
  app.use(debugbar.errorHandler());
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;
      res.status(503).json({
        error: error instanceof Error ? error.message : String(error),
      });
    },
  );
  app.use(debugbar.options.routePrefix, debugbar.router());
  return { app, debugbar };
}

describe("Express debugbar pipeline", () => {
  it("records requests, timings, memory, messages, routes, and response headers", async () => {
    const { app, debugbar } = application();
    const response = await request(app)
      .get("/ok/42")
      .set("authorization", "Bearer secret")
      .expect(200);
    expect(response.headers["x-debugbar-id"]).toMatch(DEBUG_ID_PATTERN);
    expect(response.headers["server-timing"]).toMatch(/^db;dur=2, app;dur=/);
    const record = (await waitForRecords(debugbar.store))[0]!;
    expect(record.request).toMatchObject({
      method: "GET",
      url: "/ok/42",
      route: "/ok/:id",
      status: 200,
      aborted: false,
    });
    expect(record.collectors.request).toMatchObject({
      params: { id: "42" },
      headers: { authorization: "[REDACTED]" },
    });
    expect(record.collectors.messages).toMatchObject([
      {
        level: "info",
        message: "hello",
        context: { password: "[REDACTED]", safe: "42" },
      },
    ]);
    expect(record.collectors.timing).toMatchObject({
      measures: [{ name: "route" }],
    });
    expect(record.collectors.memory).toHaveProperty("delta.heapUsed");
  });

  it("captures only configured textual request bodies", async () => {
    const { app, debugbar } = application({ captureBody: true });
    await request(app)
      .post("/echo")
      .send({ password: "secret", name: "Ada" })
      .expect(200);
    await request(app)
      .post("/echo")
      .type("form")
      .send({ token: "secret", name: "Lin" })
      .expect(200);
    await request(app)
      .post("/echo")
      .attach("file", Buffer.from("secret"), "secret.bin")
      .expect(200);
    await request(app)
      .post("/binary")
      .set("content-type", "application/octet-stream")
      .send(Buffer.from("secret"))
      .expect(204);
    const records = await waitForRecords(debugbar.store, 4);
    const byType = new Map(
      records.map((record) => [
        (record.collectors.request as any).headers["content-type"].split(
          ";",
        )[0],
        record,
      ]),
    );
    expect(
      (byType.get("application/json")!.collectors.request as any).body,
    ).toEqual({ password: "[REDACTED]", name: "Ada" });
    expect(
      (
        byType.get("application/x-www-form-urlencoded")!.collectors
          .request as any
      ).body,
    ).toEqual({ token: "[REDACTED]", name: "Lin" });
    expect(
      (byType.get("multipart/form-data")!.collectors.request as any).body,
    ).toBeUndefined();
    expect(
      (byType.get("application/octet-stream")!.collectors.request as any).body,
    ).toBeUndefined();
  });

  it("captures Error causes and thrown primitives without leaking stacks in the response", async () => {
    const { app, debugbar } = application();
    const errorResponse = await request(app).get("/throw").expect(503);
    expect(errorResponse.body).toEqual({ error: "private failure" });
    expect(errorResponse.text).not.toContain("debugbar.test.ts");
    await request(app)
      .get("/primitive")
      .expect(503, { error: "primitive failure" });
    const records = await waitForRecords(debugbar.store, 2);
    const errors = records.flatMap(
      (record) => record.collectors.errors as any[],
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Error",
          message: "private failure",
          cause: expect.objectContaining({ message: "root cause" }),
        }),
        expect.objectContaining({
          name: "string",
          message: "primitive failure",
        }),
      ]),
    );
  });

  it("isolates concurrent messages and custom measurements", async () => {
    const { app, debugbar } = application();
    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        request(app).get(`/ok/${index}`).expect(200),
      ),
    );
    const records = await waitForRecords(debugbar.store, 25);
    for (const record of records) {
      const id = record.request.url.split("/").at(-1);
      expect(record.collectors.messages).toMatchObject([
        { context: { safe: id } },
      ]);
      expect((record.collectors.timing as any).measures).toHaveLength(1);
    }
  });

  it("contains collector failures and stores one warning", async () => {
    const broken: Collector = {
      name: "broken",
      createState: () => ({}),
      onRequest: () => {
        throw new Error("collector start failed");
      },
      collect: () => {
        throw new Error("collector collect failed");
      },
    };
    const { app, debugbar } = application({ collectors: [broken] });
    await request(app).get("/ok/1").expect(200, { ok: true });
    const record = (await waitForRecords(debugbar.store))[0]!;
    expect(record.warnings.map(({ source }) => source)).toEqual([
      "broken",
      "broken",
    ]);
  });

  it("finalizes an aborted streaming response exactly once", async () => {
    const debugbar = createDebugbar({ access: () => true });
    const app = express();
    app.use(debugbar.middleware());
    app.get("/stream", (_req, res) => {
      res.write("started");
      setTimeout(() => res.end("finished"), 50);
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    await new Promise<void>((resolve) => {
      const client = http.get({
        host: "127.0.0.1",
        port: typeof address === "object" && address ? address.port : 0,
        path: "/stream",
      });
      client.on("response", (response) => {
        response.once("data", () => {
          client.destroy();
          resolve();
        });
      });
    });
    const record = (await waitForRecords(debugbar.store))[0]!;
    expect(record.request.aborted).toBe(true);
    expect(await debugbar.store.list()).toHaveLength(1);
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
});

describe("debug API", () => {
  it("allows loopback with the default development access policy", async () => {
    const debugbar = createDebugbar();
    const app = express();
    app.use("/__debugbar", debugbar.router());
    await request(app).get("/__debugbar/requests").expect(200);
  });

  it("lists, gets, paginates, clears, and never records its own routes", async () => {
    const { app, debugbar } = application();
    const first = await request(app).get("/ok/1");
    await request(app).get("/ok/2");
    await waitForRecords(debugbar.store, 2);
    const list = await request(app)
      .get("/__debugbar/requests?limit=1")
      .expect("cache-control", "no-store")
      .expect(200);
    expect(list.body).toHaveLength(1);
    const page = await request(app)
      .get(`/__debugbar/requests?before=${list.body[0].id}`)
      .expect(200);
    expect(page.body).toHaveLength(1);
    await request(app)
      .get(`/__debugbar/requests/${first.headers["x-debugbar-id"]}`)
      .expect(200);
    await request(app).get("/__debugbar/requests/missing").expect(404);
    expect(await debugbar.store.list()).toHaveLength(2);
    await request(app).delete("/__debugbar/requests").expect(204);
    expect(await debugbar.store.list()).toEqual([]);
  });

  it("applies async access control and hides denied or throwing policies", async () => {
    for (const access of [
      async () => false,
      async () => {
        throw new Error("policy");
      },
    ]) {
      const { app } = application({ access });
      await request(app).get("/__debugbar/requests").expect(404);
    }
  });

  it("uses Express proxy trust when policies inspect request.ip", async () => {
    const make = (trustProxy: boolean) => {
      const debugbar = createDebugbar({
        access: (candidate) =>
          (candidate as express.Request).ip === "203.0.113.8",
      });
      const app = express();
      app.set("trust proxy", trustProxy);
      app.use("/__debugbar", debugbar.router());
      return app;
    };
    await request(make(false))
      .get("/__debugbar/requests")
      .set("x-forwarded-for", "203.0.113.8")
      .expect(404);
    await request(make(true))
      .get("/__debugbar/requests")
      .set("x-forwarded-for", "203.0.113.8")
      .expect(200);
  });

  it("denies unconfigured cross-origin access and allows configured origins", async () => {
    const denied = application().app;
    await request(denied)
      .get("/__debugbar/requests")
      .set("origin", "https://frontend.test")
      .expect(404);

    const allowed = application({
      cors: { origins: ["https://frontend.test"], exposeHeaders: true },
    }).app;
    await request(allowed)
      .get("/__debugbar/requests")
      .set("origin", "https://frontend.test")
      .expect("access-control-allow-origin", "https://frontend.test")
      .expect(200);
    const response = await request(allowed)
      .get("/ok/1")
      .set("origin", "https://frontend.test")
      .expect(200);
    expect(response.headers["access-control-expose-headers"]).toBe(
      "X-Debugbar-ID, Server-Timing",
    );
  });

  it("sanitizes records again when serializing the API response", async () => {
    const { app, debugbar } = application();
    const unsafe: DebugRecord = {
      schemaVersion: 1,
      id: "unsafe",
      startedAt: new Date().toISOString(),
      durationMs: 1,
      request: {
        method: "GET",
        url: "/unsafe",
        status: 200,
        aborted: false,
      },
      collectors: { plugin: { password: "cleartext" } },
      warnings: [],
    };
    await debugbar.store.put(unsafe);
    const response = await request(app)
      .get("/__debugbar/requests/unsafe")
      .expect(200);
    expect(response.body.collectors.plugin.password).toBe("[REDACTED]");
  });

  it("validates ownership, schema, size, and namespace-safe client metrics", async () => {
    const { app, debugbar } = application();
    const response = await request(app).get("/ok/1");
    await waitForRecords(debugbar.store);
    const id = String(response.headers["x-debugbar-id"]);
    expect(id).toMatch(DEBUG_ID_PATTERN);
    await request(app)
      .post(`/__debugbar/client-metrics/${id}`)
      .send(["invalid"])
      .set("x-debugbar-id", id)
      .expect(400);
    await request(app)
      .post(`/__debugbar/client-metrics/${id}`)
      .send({
        schemaVersion: 1,
        metrics: [
          {
            category: "web-vital",
            name: "lcp",
            value: 10,
            unit: "ms",
            detail: { token: "secret" },
          },
        ],
      })
      .set("x-debugbar-id", "different")
      .expect(404);
    await request(app)
      .post(`/__debugbar/client-metrics/${id}`)
      .send({ schemaVersion: 1, metrics: [], timing: { totalMs: 0 } })
      .set("x-debugbar-id", id)
      .expect(400);
    await request(app)
      .post(`/__debugbar/client-metrics/${id}`)
      .send({
        schemaVersion: 1,
        metrics: [
          {
            category: "web-vital",
            name: "lcp",
            value: 10,
            unit: "ms",
            detail: { token: "secret" },
          },
        ],
      })
      .set("x-debugbar-id", id)
      .expect(204);
    expect((await debugbar.store.get(id))!.collectors.client).toEqual({
      schemaVersion: 1,
      metrics: [
        expect.objectContaining({
          name: "lcp",
          detail: { token: "[REDACTED]" },
        }),
      ],
    });
    expect((await debugbar.store.get(id))!.collectors.timing).toBeDefined();
    await request(app)
      .post(`/__debugbar/client-metrics/${id}`)
      .set("x-debugbar-id", id)
      .set("content-type", "application/json")
      .send(
        JSON.stringify({
          schemaVersion: 1,
          metrics: [],
          padding: "x".repeat(33_000),
        }),
      )
      .expect(413);
    await request(app)
      .post("/__debugbar/client-metrics/missing")
      .set("x-debugbar-id", "missing")
      .send({ schemaVersion: 1, metrics: [] })
      .expect(404);
  });
});

describe("transparent behavior", () => {
  it("is inert when disabled", async () => {
    const { app, debugbar } = application({ enabled: false });
    const response = await request(app).get("/ok/1").expect(200, { ok: true });
    expect(response.headers["x-debugbar-id"]).toBeUndefined();
    expect(await debugbar.store.list()).toEqual([]);
    await request(app).get("/__debugbar/requests").expect(404);
  });

  it("contains store failures and preserves the application response contract", async () => {
    const failingStore: DebugbarStore = {
      put: async () => {
        throw new Error("storage unavailable");
      },
      get: async () => undefined,
      list: async () => [],
      clear: async () => undefined,
    };
    const instrumented = application({ store: failingStore }).app;
    const control = express();
    control.get("/ok/1", (_req, res) => {
      res.setHeader("Server-Timing", "db;dur=2");
      res.json({ ok: true });
    });
    const [actual, expected] = await Promise.all([
      request(instrumented).get("/ok/1"),
      request(control).get("/ok/1"),
    ]);
    expect(actual.status).toBe(expected.status);
    expect(actual.body).toEqual(expected.body);
    expect(actual.headers["content-type"]).toBe(
      expected.headers["content-type"],
    );
  });
});
