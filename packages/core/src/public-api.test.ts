import { expectTypeOf, test } from "vitest";
import type { DebugRecord } from "./index.js";

test("record schema version is the literal 1", () => {
  expectTypeOf<DebugRecord["schemaVersion"]>().toEqualTypeOf<1>();
});
