import assert from "node:assert/strict";
import console from "node:console";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(path.join(os.tmpdir(), "debugbar-unsupported-"));
const artifacts = path.join(temporary, "tarballs");
const consumer = path.join(temporary, "consumer");
mkdirSync(artifacts);
mkdirSync(consumer);

try {
  const packed = spawnSync(
    "npm",
    [
      "pack",
      "--json",
      "--pack-destination",
      artifacts,
      path.join(root, "packages", "react"),
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(packed.status, 0, packed.stderr);
  const [result] = JSON.parse(packed.stdout);
  writeFileSync(
    path.join(consumer, "package.json"),
    JSON.stringify(
      {
        name: "unsupported-react-check",
        private: true,
        dependencies: {
          "@debugbar/react": `file:${path.join(artifacts, result.filename)}`,
          react: "17.0.2",
          "react-dom": "17.0.2",
        },
      },
      null,
      2,
    ),
  );
  const installation = spawnSync(
    "npm",
    ["install", "--strict-peer-deps", "--no-audit", "--no-fund"],
    { cwd: consumer, encoding: "utf8" },
  );
  assert.notEqual(
    installation.status,
    0,
    "React 17 unexpectedly satisfied the package peer range",
  );
  assert.match(
    `${installation.stdout}\n${installation.stderr}`,
    /peer|ERESOLVE/i,
  );
  console.log(
    "Unsupported React 17 correctly failed with a peer-dependency error.",
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
