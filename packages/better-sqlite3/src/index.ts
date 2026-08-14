import type Database from "better-sqlite3";
import { sanitize } from "@debugbar/core";
import type {
  DatabaseAdapter,
  DatabaseQueryEvent,
  JsonValue,
} from "@debugbar/core";

type Parameters = readonly unknown[] | Record<string, unknown>;

export class BetterSqlite3Adapter implements DatabaseAdapter {
  readonly #database: Database.Database;
  readonly #connection: string;
  readonly #listeners = new Set<(event: DatabaseQueryEvent) => void>();

  constructor(database: Database.Database, connection = "sqlite") {
    this.#database = database;
    this.#connection = connection;
  }

  install(listener: (event: DatabaseQueryEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  exec(statement: string): Database.Database {
    return this.#execute("exec", statement, [], () =>
      this.#database.exec(statement),
    );
  }

  run(statement: string, parameters: Parameters = []): Database.RunResult {
    return this.#execute("run", statement, parameters, () =>
      this.#database.prepare(statement).run(parameters),
    );
  }

  get<T = unknown>(
    statement: string,
    parameters: Parameters = [],
  ): T | undefined {
    return this.#execute(
      "get",
      statement,
      parameters,
      () => this.#database.prepare(statement).get(parameters) as T | undefined,
    );
  }

  all<T = unknown>(statement: string, parameters: Parameters = []): T[] {
    return this.#execute(
      "all",
      statement,
      parameters,
      () => this.#database.prepare(statement).all(parameters) as T[],
    );
  }

  #execute<T>(
    operation: string,
    statement: string,
    parameters: Parameters,
    callback: () => T,
  ): T {
    const startedAt = performance.now();
    try {
      const result = callback();
      this.#emit({
        operation,
        statement,
        parameters: sanitize(parameters),
        durationMs: performance.now() - startedAt,
        connection: this.#connection,
        success: true,
      });
      return result;
    } catch (error) {
      this.#emit({
        operation,
        statement,
        parameters: sanitize(parameters),
        durationMs: performance.now() - startedAt,
        connection: this.#connection,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  #emit(event: DatabaseQueryEvent): void {
    for (const listener of this.#listeners) listener(event);
  }
}

export type { DatabaseAdapter, DatabaseQueryEvent, JsonValue };
