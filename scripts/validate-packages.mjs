import assert from "node:assert/strict";
import console from "node:console";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(path.join(os.tmpdir(), "debugbar-release-"));
const artifacts = path.join(temporary, "tarballs");
const consumer = path.join(temporary, "consumer");
mkdirSync(artifacts);
mkdirSync(consumer);

const packages = ["core", "express", "react", "better-sqlite3", "pg", "mysql2"];
const tarballs = new Map();

function run(command, arguments_, options = {}) {
  return execFileSync(command, arguments_, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    ...options,
  });
}

try {
  for (const packageDirectory of packages) {
    const output = run(
      "npm",
      [
        "pack",
        "--json",
        "--pack-destination",
        artifacts,
        path.join(root, "packages", packageDirectory),
      ],
      { capture: true },
    );
    const [packed] = JSON.parse(output);
    assert.ok(packed, `npm pack returned no result for ${packageDirectory}`);
    const paths = packed.files.map((file) => file.path);
    for (const required of [
      "package.json",
      "README.md",
      "LICENSE",
      "dist/index.js",
      "dist/index.d.ts",
    ])
      assert.ok(
        paths.includes(required),
        `${packed.name} is missing ${required}`,
      );
    assert.equal(
      paths.some(
        (file) => file.startsWith("src/") || file.endsWith(".tsbuildinfo"),
      ),
      false,
      `${packed.name} leaked source or build-cache files`,
    );
    assert.equal(
      paths.every(
        (file) =>
          file === "package.json" ||
          file === "README.md" ||
          file === "LICENSE" ||
          file.startsWith("dist/"),
      ),
      true,
      `${packed.name} contains an unexpected file`,
    );
    tarballs.set(packed.name, path.join(artifacts, packed.filename));
    console.log(`${packed.name}: ${paths.length} files, ${packed.size} bytes`);
  }

  const dependencies = Object.fromEntries(
    [...tarballs].map(([name, tarball]) => [name, `file:${tarball}`]),
  );
  Object.assign(dependencies, {
    express: "5.1.0",
    react: "19.1.1",
    "react-dom": "19.1.1",
    pg: "8.23.0",
    mysql2: "3.23.3",
    "better-sqlite3": "11.10.0",
    typescript: "5.9.2",
    "@types/express": "5.0.3",
    "@types/node": "22.17.1",
    "@types/pg": "8.21.0",
    "@types/react": "19.1.10",
    "@types/react-dom": "19.1.7",
  });
  writeFileSync(
    path.join(consumer, "package.json"),
    JSON.stringify(
      {
        name: "debugbar-clean-consumer",
        private: true,
        type: "module",
        dependencies,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(consumer, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ["smoke.ts"],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(consumer, "smoke.ts"),
    `import { MemoryStore, installDatabaseAdapter } from "@debugbar/core";
import { createDebugbar } from "@debugbar/express";
import { PgAdapter } from "@debugbar/pg";
import { Mysql2Adapter } from "@debugbar/mysql2";
import { BetterSqlite3Adapter } from "@debugbar/better-sqlite3";
import { Debugbar, DebugbarProvider } from "@debugbar/react";
const queryable = { query: (..._args: unknown[]) => Promise.resolve([]) };
const pg = new PgAdapter(queryable);
const mysql = new Mysql2Adapter(queryable);
const debugbar = createDebugbar({ enabled: false, store: new MemoryStore() });
const remove = installDatabaseAdapter(pg);
void [mysql, debugbar, remove, BetterSqlite3Adapter, Debugbar, DebugbarProvider];
`,
  );
  writeFileSync(
    path.join(consumer, "smoke.mjs"),
    `import assert from "node:assert/strict";
import { MemoryStore } from "@debugbar/core";
import { createDebugbar } from "@debugbar/express";
import { PgAdapter } from "@debugbar/pg";
import { Mysql2Adapter } from "@debugbar/mysql2";
const queryable = { query: () => Promise.resolve("ok") };
const pg = new PgAdapter(queryable);
const events = [];
const cleanup = pg.install((event) => events.push(event));
assert.equal(await queryable.query("select 1"), "ok");
assert.equal(events.length, 1);
cleanup();
assert.ok(new Mysql2Adapter(queryable));
assert.ok(createDebugbar({ enabled: false, store: new MemoryStore() }));
console.log("Clean consumer import and runtime smoke test passed.");
`,
  );
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: consumer, stdio: "inherit" },
  );
  execFileSync(
    path.join(consumer, "node_modules", ".bin", "tsc"),
    ["-p", "tsconfig.json"],
    { cwd: consumer, stdio: "inherit" },
  );
  execFileSync(process.execPath, ["smoke.mjs"], {
    cwd: consumer,
    stdio: "inherit",
  });
  console.log(
    `Validated ${packages.length} package tarballs in a clean consumer.`,
  );
} finally {
  if (process.env.KEEP_RELEASE_TEMP)
    console.log(`Release files retained at ${temporary}`);
  else rmSync(temporary, { recursive: true, force: true });
}
