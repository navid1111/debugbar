import { randomBytes } from "node:crypto";

const ID_BYTES = 18;
export const DEBUG_ID_PATTERN = /^[A-Za-z0-9_-]{24}$/;

export function createDebugId(): string {
  return randomBytes(ID_BYTES).toString("base64url");
}
