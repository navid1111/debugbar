import type { DebugRecord, JsonValue } from "@debugbar/core";
import type { ReactNode } from "react";

export type PanelId =
  | "overview"
  | "timeline"
  | "request"
  | "messages"
  | "errors"
  | "database"
  | "raw";

export const PANELS: Array<{ id: PanelId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "request", label: "Request" },
  { id: "messages", label: "Messages" },
  { id: "errors", label: "Errors" },
  { id: "database", label: "Database" },
  { id: "raw", label: "Raw Data" },
];

function bounded(value: unknown, depth = 0): unknown {
  if (depth >= 8) return "[Maximum display depth]";
  if (typeof value === "string")
    return value.length > 5_000
      ? `${value.slice(0, 5_000)}…[truncated]`
      : value;
  if (Array.isArray(value))
    return value.slice(0, 200).map((item) => bounded(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 200)
        .map(([key, item]) => [key, bounded(item, depth + 1)]),
    );
  }
  return value;
}

export function JsonView({
  value,
  empty = "No data collected.",
}: {
  value: unknown;
  empty?: string;
}) {
  if (
    value === undefined ||
    value === null ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return <p>{empty}</p>;
  }
  return (
    <pre style={styles.pre}>{JSON.stringify(bounded(value), null, 2)}</pre>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={styles.card}>
      <h3 style={styles.heading}>{title}</h3>
      {children}
    </section>
  );
}

function DatabasePanel({ value }: { value: JsonValue | undefined }) {
  if (!Array.isArray(value) || value.length === 0) {
    return <p>No database data collected.</p>;
  }
  return (
    <div style={styles.queryList}>
      {value.slice(0, 200).map((candidate, index) => {
        const query =
          candidate &&
          typeof candidate === "object" &&
          !Array.isArray(candidate)
            ? candidate
            : {};
        const success = query.success === true;
        const duration =
          typeof query.durationMs === "number" ? query.durationMs : 0;
        const performanceLabel = duration >= 100 ? "Slow" : "Normal";
        return (
          <section
            key={index}
            style={styles.card}
            aria-label={`Database operation ${index + 1}`}
          >
            <h3 style={styles.heading}>
              {String(query.operation ?? "query")} —{" "}
              {success ? "Succeeded" : "Failed"} — {performanceLabel}
            </h3>
            <p>
              {duration.toFixed(1)} ms · {String(query.connection ?? "default")}
            </p>
            <details open={!success}>
              <summary>SQL statement</summary>
              <pre style={styles.pre}>{String(query.statement ?? "")}</pre>
            </details>
            {query.parameters !== undefined && (
              <JsonView value={query.parameters} empty="No parameters." />
            )}
            {!success && query.error !== undefined && (
              <p role="alert">{String(query.error)}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function DebugPanel({
  panel,
  record,
}: {
  panel: PanelId;
  record: DebugRecord;
}) {
  if (panel === "overview") {
    return (
      <div style={styles.grid}>
        <Card title="Request">
          <dl style={styles.definition}>
            <dt>Method</dt>
            <dd>{record.request.method}</dd>
            <dt>URL</dt>
            <dd>{record.request.url}</dd>
            <dt>Status</dt>
            <dd>{record.request.status}</dd>
            <dt>Duration</dt>
            <dd>{record.durationMs.toFixed(1)} ms</dd>
          </dl>
        </Card>
        <Card title="Collectors">
          <p>{Object.keys(record.collectors).join(", ") || "None"}</p>
        </Card>
      </div>
    );
  }
  if (panel === "database") {
    return <DatabasePanel value={record.collectors.database} />;
  }
  const values: Record<
    Exclude<PanelId, "overview" | "database" | "raw">,
    JsonValue | undefined
  > = {
    timeline: record.collectors.timing,
    request: record.collectors.request,
    messages: record.collectors.messages,
    errors: record.collectors.errors,
  };
  const value = panel === "raw" ? record.collectors : values[panel];
  return <JsonView value={value} empty={`No ${panel} data collected.`} />;
}

const styles = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  card: {
    border: "1px solid #40506a",
    borderRadius: 8,
    padding: 12,
    background: "#172033",
  },
  heading: { fontSize: 14, margin: "0 0 8px" },
  definition: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    gap: "6px 12px",
    margin: 0,
  },
  pre: {
    margin: 0,
    padding: 12,
    borderRadius: 8,
    overflow: "auto",
    maxHeight: "100%",
    background: "#0b1020",
    color: "#e6edf7",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontSize: 12,
  },
  queryList: { display: "grid", gap: 12 },
} as const;
