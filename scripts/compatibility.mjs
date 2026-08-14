import assert from "node:assert/strict";
import console from "node:console";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reactVersion = process.env.COMPAT_REACT ?? "19.2.8";
const expressVersion = process.env.COMPAT_EXPRESS ?? "5.2.1";
const temporary = mkdtempSync(path.join(os.tmpdir(), "debugbar-compat-"));
const artifacts = path.join(temporary, "tarballs");
const consumer = path.join(temporary, "consumer");
mkdirSync(artifacts);
mkdirSync(consumer);

function output(command, arguments_, cwd = root) {
  return execFileSync(command, arguments_, { cwd, encoding: "utf8" });
}

try {
  const dependencies = {};
  for (const directory of ["core", "express", "react"]) {
    const [packed] = JSON.parse(
      output("npm", [
        "pack",
        "--json",
        "--pack-destination",
        artifacts,
        path.join(root, "packages", directory),
      ]),
    );
    dependencies[packed.name] = `file:${path.join(artifacts, packed.filename)}`;
  }
  Object.assign(dependencies, {
    express: expressVersion,
    react: reactVersion,
    "react-dom": reactVersion,
    typescript: "5.9.2",
    "@types/express": "5.0.3",
    "@types/node": "22.17.1",
    "@types/react": reactVersion.startsWith("18.") ? "18.3.24" : "19.1.10",
    "@types/react-dom": reactVersion.startsWith("18.") ? "18.3.7" : "19.1.7",
  });
  writeFileSync(
    path.join(consumer, "package.json"),
    JSON.stringify(
      {
        name: "debugbar-compatibility",
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
          jsx: "react-jsx",
        },
        include: ["smoke.tsx"],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    path.join(consumer, "smoke.tsx"),
    `import express from "express";
import { renderToString } from "react-dom/server";
import { createDebugbar } from "@debugbar/express";
import { Debugbar, DebugbarProvider } from "@debugbar/react";
const app = express();
const debugbar = createDebugbar({ enabled: false });
app.use(debugbar.middleware());
renderToString(<DebugbarProvider autoDiscover={false}><Debugbar /></DebugbarProvider>);
`,
  );
  execFileSync("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: consumer,
    stdio: "inherit",
  });
  execFileSync(
    path.join(consumer, "node_modules", ".bin", "tsc"),
    ["-p", "tsconfig.json"],
    { cwd: consumer, stdio: "inherit" },
  );
  const tree = JSON.parse(
    output("npm", ["ls", "react", "express", "--json"], consumer),
  );
  assert.equal(tree.dependencies.react.version, reactVersion);
  assert.equal(tree.dependencies.express.version, expressVersion);
  console.log(
    `Compatibility passed: Node ${process.versions.node}, React ${reactVersion}, Express ${expressVersion}.`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
