import type { DebugRecord } from "./index.js";

const valid: DebugRecord = {
  schemaVersion: 1,
  id: "fixture",
  startedAt: new Date(0).toISOString(),
  durationMs: 1,
  request: { method: "GET", url: "/", status: 200, aborted: false },
  collectors: {},
  warnings: [],
};

// @ts-expect-error schema versions other than 1 are deliberately rejected.
const invalidVersion: DebugRecord = { ...valid, schemaVersion: 2 };

void invalidVersion;
export { valid };
