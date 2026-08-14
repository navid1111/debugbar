import type { Request, RequestHandler } from "express";
import type { ReactElement } from "react";
import type { Pool as PgPool } from "pg";
import type { Pool as MysqlPool } from "mysql2";
import type { Collector, DebugbarStore } from "@debugbar/core";
import { installDatabaseAdapter, MemoryStore } from "@debugbar/core";
import { createDebugbar } from "@debugbar/express";
import { Mysql2Adapter } from "@debugbar/mysql2";
import { PgAdapter } from "@debugbar/pg";
import {
  createClientMetricsReporter,
  Debugbar,
  DebugbarProfiler,
  DebugbarProvider,
  installWebVitals,
} from "@debugbar/react";

declare const pgPool: PgPool;
declare const mysqlPool: MysqlPool;
declare const application: ReactElement;

const collector: Collector<{ count: number }, { count: number }> = {
  name: "example",
  createState: () => ({ count: 0 }),
  collect: (state) => state,
};
const store: DebugbarStore = new MemoryStore();
const debugbar = createDebugbar({
  enabled: true,
  access: (candidate) =>
    Boolean((candidate as Request & { user?: unknown }).user),
  collectors: [collector],
  store,
});
const middleware: RequestHandler = debugbar.middleware();
void middleware;

const removePg = installDatabaseAdapter(new PgAdapter(pgPool, "primary"));
const removeMysql = installDatabaseAdapter(
  new Mysql2Adapter(mysqlPool, "analytics"),
);
removePg();
removeMysql();

const reporter = createClientMetricsReporter("abcdefghijklmnopqrstuvwx");
const stopVitals = installWebVitals(reporter, { enabled: true });
stopVitals();

export const documentedApplication = (
  <DebugbarProvider>
    <DebugbarProfiler id="Application" reporter={reporter} enabled>
      {application}
    </DebugbarProfiler>
    <Debugbar />
  </DebugbarProvider>
);
