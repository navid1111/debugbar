import express from "express";
import Database from "better-sqlite3";
import { createServer as createViteServer } from "vite";
import { installDatabaseAdapter } from "@debugbar/core";
import { createDebugbar } from "@debugbar/express";
import { BetterSqlite3Adapter } from "@debugbar/better-sqlite3";

const app = express();
const port = Number(process.env.PORT ?? 4173);
const debugbar = createDebugbar({
  access: (candidate) =>
    (candidate as express.Request).headers.cookie !== "debugbar-denied=1",
});
const database = new Database(":memory:");
const sql = new BetterSqlite3Adapter(database, "example-memory");
sql.exec("create table users (id integer primary key, name text, email text)");
sql.run("insert into users (name, email) values (?, ?)", [
  "Ada Lovelace",
  "ada@example.test",
]);
sql.run("insert into users (name, email) values (?, ?)", [
  "Grace Hopper",
  "grace@example.test",
]);
installDatabaseAdapter(sql, { maskedKeys: debugbar.options.maskedKeys });

app.use(express.json());
app.use(debugbar.middleware());

app.get("/api/success", (_request, response) => {
  debugbar.info("Loaded example data", { source: "success endpoint" });
  debugbar.measure("example-work", () => Math.sqrt(144));
  response.json({ message: "Request completed" });
});

app.get("/api/failure", () => {
  throw new Error("Example failure");
});

app.get("/api/users", (_request, response) => {
  const users = sql.all<{ id: number; name: string }>(
    "select id, name from users where email like ? order by id",
    ["%@example.test"],
  );
  response.json({ users });
});

app.get("/api/sql-error", (_request, response) => {
  try {
    sql.all("select * from missing_table");
  } catch {
    response.status(500).json({ error: "Database query failed" });
  }
});

app.use(debugbar.errorHandler());
app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    void _next;
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  },
);
app.use(debugbar.options.routePrefix, debugbar.router());

const vite = await createViteServer({
  root: new URL("..", import.meta.url).pathname,
  server: { middlewareMode: true },
  appType: "spa",
});
app.use(vite.middlewares);

app.listen(port, "127.0.0.1", () => {
  console.log(`Example running at http://127.0.0.1:${port}`);
});
