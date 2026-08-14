import { sanitize } from "@debugbar/core";
import type { DatabaseAdapter, DatabaseQueryEvent } from "@debugbar/core";

type QueryFunction = (...arguments_: unknown[]) => unknown;
export interface MysqlQueryable {
  query: QueryFunction;
}

function queryData(arguments_: unknown[]) {
  const first = arguments_[0];
  if (typeof first === "string")
    return {
      statement: first,
      parameters:
        Array.isArray(arguments_[1]) ||
        (arguments_[1] && typeof arguments_[1] === "object")
          ? arguments_[1]
          : [],
    };
  if (first && typeof first === "object") {
    const config = first as Record<string, unknown>;
    return {
      statement:
        typeof config.sql === "string" ? config.sql : "[unknown query]",
      parameters:
        config.values && typeof config.values === "object" ? config.values : [],
    };
  }
  return { statement: "[unknown query]", parameters: [] };
}

function operation(statement: string) {
  return statement.trim().split(/\s+/, 1)[0]?.toLowerCase() || "query";
}

function lastCallbackIndex(values: unknown[]) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (typeof values[index] === "function") return index;
  }
  return -1;
}

export class Mysql2Adapter implements DatabaseAdapter {
  readonly #client: MysqlQueryable;
  readonly #connection: string;
  readonly #listeners = new Set<(event: DatabaseQueryEvent) => void>();
  readonly #original: QueryFunction;
  #patched = false;

  constructor(client: { query: unknown }, connection = "mysql") {
    if (typeof client.query !== "function")
      throw new TypeError("Mysql2Adapter requires a mysql2 connection or pool");
    this.#client = client as MysqlQueryable;
    this.#connection = connection;
    this.#original = client.query as QueryFunction;
  }

  install(listener: (event: DatabaseQueryEvent) => void): () => void {
    this.#listeners.add(listener);
    this.#patch();
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#restore();
    };
  }

  #patch() {
    if (this.#patched) return;
    this.#client.query = (...arguments_: unknown[]) =>
      this.#query(this.#client, arguments_);
    this.#patched = true;
  }

  #restore() {
    if (!this.#patched) return;
    this.#client.query = this.#original;
    this.#patched = false;
  }

  #query(receiver: unknown, arguments_: unknown[]): unknown {
    const { statement, parameters } = queryData(arguments_);
    const startedAt = performance.now();
    let finished = false;
    const finish = (success: boolean, error?: unknown) => {
      if (finished) return;
      finished = true;
      const event: DatabaseQueryEvent = {
        operation: operation(statement),
        statement,
        parameters: sanitize(parameters),
        durationMs: performance.now() - startedAt,
        connection: this.#connection,
        success,
        ...(error === undefined
          ? {}
          : { error: error instanceof Error ? error.message : String(error) }),
      };
      for (const listener of this.#listeners) listener(event);
    };
    const callbackIndex = lastCallbackIndex(arguments_);
    if (callbackIndex >= 0) {
      const callback = arguments_[callbackIndex] as QueryFunction;
      arguments_[callbackIndex] = function (...callbackArguments: unknown[]) {
        finish(!callbackArguments[0], callbackArguments[0]);
        return callback.apply(this, callbackArguments);
      };
    }
    try {
      const result = this.#original.apply(receiver, arguments_);
      if (
        result &&
        typeof result === "object" &&
        "then" in result &&
        typeof result.then === "function"
      ) {
        return Promise.resolve(result).then(
          (value) => {
            finish(true);
            return value;
          },
          (error: unknown) => {
            finish(false, error);
            throw error;
          },
        );
      }
      return result;
    } catch (error) {
      finish(false, error);
      throw error;
    }
  }
}

export type { DatabaseAdapter, DatabaseQueryEvent };
