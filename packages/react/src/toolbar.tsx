import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { DebugPanel, PANELS } from "./panels.js";
import type { PanelId } from "./panels.js";
import { useDebugbar } from "./provider.js";

const OPEN_KEY = "debugbar:open";
const PANEL_KEY = "debugbar:panel";
const HEIGHT_KEY = "debugbar:height";

function stored<T>(key: string, fallback: T, parse: (value: string) => T): T {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : parse(value);
  } catch {
    return fallback;
  }
}

function statusColor(status: number): string {
  if (status >= 500) return "#ff8a80";
  if (status >= 400) return "#ffd180";
  if (status >= 300) return "#80d8ff";
  return "#8ee6a4";
}

export interface DebugbarProps {
  className?: string;
}

export function Debugbar({ className }: DebugbarProps) {
  const { summaries, selected, select } = useDebugbar();
  const [open, setOpen] = useState(() =>
    stored(OPEN_KEY, false, (value) => value === "true"),
  );
  const [panel, setPanel] = useState<PanelId>(() =>
    stored(PANEL_KEY, "overview", (value) =>
      PANELS.some(({ id }) => id === value) ? (value as PanelId) : "overview",
    ),
  );
  const [height, setHeight] = useState(() =>
    stored(HEIGHT_KEY, 360, (value) =>
      Math.min(720, Math.max(220, Number(value) || 360)),
    ),
  );
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = selected.status === "ready" ? selected.record : undefined;
  const summary = current
    ? {
        method: current.request.method,
        url: current.request.url,
        status: current.request.status,
        durationMs: current.durationMs,
      }
    : summaries[0];

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, String(open));
    } catch {
      /* optional preference */
    }
  }, [open]);
  useEffect(() => {
    try {
      localStorage.setItem(PANEL_KEY, panel);
    } catch {
      /* optional preference */
    }
  }, [panel]);
  useEffect(() => {
    try {
      localStorage.setItem(HEIGHT_KEY, String(height));
    } catch {
      /* optional preference */
    }
  }, [height]);
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => toggleRef.current?.focus());
  };
  const navigateTabs = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let target = index;
    if (event.key === "ArrowRight") target = (index + 1) % PANELS.length;
    else if (event.key === "ArrowLeft")
      target = (index - 1 + PANELS.length) % PANELS.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = PANELS.length - 1;
    else return;
    event.preventDefault();
    const next = PANELS[target]!;
    setPanel(next.id);
    tabRefs.current[target]?.focus();
  };

  return (
    <aside
      className={className}
      aria-label="Application debug toolbar"
      style={styles.root}
    >
      <style>{`@media (prefers-reduced-motion: reduce) { [data-debugbar-panel] { transition: none !important; } }`}</style>
      {open ? (
        <div
          ref={panelRef}
          data-debugbar-panel
          tabIndex={-1}
          style={{ ...styles.panel, height }}
        >
          <header style={styles.header}>
            <strong>Debugbar</strong>
            <label style={styles.selectorLabel}>
              Request
              <select
                aria-label="Debug request"
                value={current?.id ?? ""}
                onChange={(event) => void select(event.target.value)}
                style={styles.select}
              >
                <option value="" disabled>
                  Select a request
                </option>
                {summaries.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.method} {item.url} · {item.status}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={close}
              aria-label="Close debug toolbar"
              style={styles.button}
            >
              Close
            </button>
          </header>
          <label style={styles.resizeLabel}>
            Panel height
            <input
              aria-label="Panel height"
              type="range"
              min="220"
              max="720"
              step="20"
              value={height}
              onChange={(event) => setHeight(Number(event.target.value))}
            />
          </label>
          <div
            role="tablist"
            aria-label="Debug information"
            style={styles.tabs}
          >
            {PANELS.map((item, index) => (
              <button
                key={item.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`debugbar-tab-${item.id}`}
                aria-selected={panel === item.id}
                aria-controls={`debugbar-panel-${item.id}`}
                tabIndex={panel === item.id ? 0 : -1}
                onClick={() => setPanel(item.id)}
                onKeyDown={(event) => navigateTabs(event, index)}
                style={{
                  ...styles.tab,
                  ...(panel === item.id ? styles.activeTab : {}),
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`debugbar-panel-${panel}`}
            aria-labelledby={`debugbar-tab-${panel}`}
            style={styles.content}
          >
            {selected.status === "idle" && <p>Select a request to inspect.</p>}
            {selected.status === "loading" && (
              <p role="status">Loading debug record…</p>
            )}
            {selected.status === "missing" && (
              <p role="status">This debug record is no longer available.</p>
            )}
            {selected.status === "error" && (
              <p role="alert">
                Unable to load debug data: {selected.error.message}
              </p>
            )}
            {current && <DebugPanel panel={panel} record={current} />}
          </div>
        </div>
      ) : null}
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={styles.toggle}
      >
        <span style={styles.brand}>Debugbar</span>
        {summary ? (
          <>
            <span>{summary.method}</span>
            <span style={styles.url}>{summary.url}</span>
            <span style={{ color: statusColor(summary.status) }}>
              {summary.status}
            </span>
            <span>{summary.durationMs.toFixed(1)} ms</span>
          </>
        ) : (
          <span>No requests</span>
        )}
      </button>
    </aside>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    position: "fixed",
    inset: "auto 0 0 0",
    zIndex: 2147483647,
    color: "#f5f7fb",
    font: "13px/1.4 ui-sans-serif, system-ui, sans-serif",
    colorScheme: "dark",
  },
  panel: {
    display: "grid",
    gridTemplateRows: "auto auto auto minmax(0, 1fr)",
    background: "#111827",
    borderTop: "1px solid #40506a",
    boxShadow: "0 -8px 30px rgba(0,0,0,.35)",
    outline: "none",
    transition: "height 120ms ease",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
    padding: "8px 12px",
    borderBottom: "1px solid #2f3b52",
  },
  selectorLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  select: {
    minWidth: 0,
    maxWidth: 520,
    width: "100%",
    padding: "5px 8px",
    background: "#172033",
    color: "inherit",
    border: "1px solid #52617a",
    borderRadius: 5,
  },
  resizeLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 12px",
    borderBottom: "1px solid #2f3b52",
    fontSize: 11,
  },
  tabs: {
    display: "flex",
    gap: 2,
    overflowX: "auto",
    padding: "6px 8px 0",
    borderBottom: "1px solid #2f3b52",
  },
  tab: {
    padding: "7px 10px",
    whiteSpace: "nowrap",
    background: "transparent",
    color: "#cbd5e1",
    borderTop: 0,
    borderRight: 0,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    borderLeft: 0,
    cursor: "pointer",
  },
  activeTab: {
    color: "#fff",
    borderBottomColor: "#6ea8fe",
    background: "#172033",
  },
  content: { minHeight: 0, overflow: "auto", padding: 12 },
  button: {
    marginLeft: "auto",
    padding: "6px 10px",
    border: "1px solid #52617a",
    borderRadius: 5,
    background: "#1d2940",
    color: "inherit",
    cursor: "pointer",
  },
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    minHeight: 34,
    padding: "6px 12px",
    border: 0,
    borderTop: "1px solid #40506a",
    background: "#0b1020",
    color: "#dbe6f6",
    cursor: "pointer",
    textAlign: "left",
  },
  brand: { color: "#80b7ff", fontWeight: 700 },
  url: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
};
