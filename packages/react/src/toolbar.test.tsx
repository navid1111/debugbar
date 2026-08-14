// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { describe, expect, it } from "vitest";
import type { DebugRecord, DebugRecordSummary } from "@debugbar/core";
import type { DebugbarApi } from "./api.js";
import { DebugbarProvider } from "./provider.js";
import { DebugPanel } from "./panels.js";
import { Debugbar } from "./toolbar.js";

const malicious = '<img src=x onerror="alert(1)">';
const fullRecord: DebugRecord = {
  schemaVersion: 1,
  id: "one",
  startedAt: new Date(0).toISOString(),
  durationMs: 12.34,
  request: { method: "GET", url: "/api/users", status: 200, aborted: false },
  collectors: {
    timing: { measures: [] },
    request: { query: {} },
    messages: [{ message: malicious }],
    errors: [],
    database: [
      {
        operation: "all",
        statement: "select * from users where email = ?",
        parameters: ["[REDACTED]"],
        durationMs: 123.2,
        connection: "test",
        success: true,
      },
      {
        operation: "all",
        statement: "select * from missing_table",
        durationMs: 1.1,
        connection: "test",
        success: false,
        error: "no such table: missing_table",
      },
    ],
    customPlugin: { rows: Array.from({ length: 250 }, (_, id) => ({ id })) },
  },
  warnings: [],
};
const summary: DebugRecordSummary = {
  id: "one",
  startedAt: fullRecord.startedAt,
  method: "GET",
  url: "/api/users",
  status: 200,
  durationMs: 12.34,
  errorCount: 0,
};
const api: DebugbarApi = {
  list: async () => [summary],
  get: async () => fullRecord,
};

async function renderToolbar() {
  const result = render(
    <DebugbarProvider api={api} autoDiscover={false}>
      <Debugbar />
    </DebugbarProvider>,
  );
  await waitFor(() =>
    expect(screen.getByText("/api/users")).toBeInTheDocument(),
  );
  return result;
}

describe("Debugbar toolbar", () => {
  it("handles partial collector data and preserves unknown collectors", () => {
    const partial = {
      ...fullRecord,
      collectors: { customPlugin: { available: true } },
    };
    const { rerender } = render(
      <DebugPanel panel="messages" record={partial} />,
    );
    expect(screen.getByText("No messages data collected.")).toBeInTheDocument();
    rerender(<DebugPanel panel="raw" record={partial} />);
    expect(screen.getByText(/customPlugin/)).toBeInTheDocument();
    expect(screen.getByText(/available/)).toBeInTheDocument();
  });

  it("shows a responsive summary and persists UI preferences only", async () => {
    await renderToolbar();
    expect(
      screen.getByRole("button", {
        name: /Debugbar GET.*\/api\/users.*200.*12.3 ms/,
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Debugbar GET/ }));
    const select = screen.getByLabelText("Debug request");
    await userEvent.selectOptions(select, "one");
    await waitFor(() =>
      expect(screen.getByText("Collectors")).toBeInTheDocument(),
    );
    expect(localStorage.getItem("debugbar:open")).toBe("true");
    expect(localStorage.getItem("debugbar:panel")).toBe("overview");
    const persisted = Array.from(
      { length: localStorage.length },
      (_, index) => localStorage.getItem(localStorage.key(index) ?? "") ?? "",
    ).join(" ");
    expect(persisted).not.toContain("/api/users");
    window.innerWidth = 320;
    window.dispatchEvent(new Event("resize"));
    expect(screen.getByRole("button", { name: /Debugbar GET/ })).toBeVisible();
  });

  it("supports focus restoration and keyboard tab navigation", async () => {
    await renderToolbar();
    const user = userEvent.setup();
    const toggle = screen.getByRole("button", { name: /Debugbar GET/ });
    await user.click(toggle);
    expect(
      screen
        .getByRole("complementary", { name: "Application debug toolbar" })
        .querySelector("[data-debugbar-panel]"),
    ).toHaveFocus();
    const overview = screen.getByRole("tab", { name: "Overview" });
    overview.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(
      screen.getByRole("button", { name: "Close debug toolbar" }),
    );
    await waitFor(() => expect(toggle).toHaveFocus());
  });

  it("renders malicious and oversized collector values as bounded text", async () => {
    await renderToolbar();
    await userEvent.click(screen.getByRole("button", { name: /Debugbar GET/ }));
    await userEvent.selectOptions(
      screen.getByLabelText("Debug request"),
      "one",
    );
    await userEvent.click(screen.getByRole("tab", { name: "Messages" }));
    expect(screen.getByText(new RegExp("<img src=x"))).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Raw Data" }));
    const text = screen.getByRole("tabpanel").textContent ?? "";
    expect(text).toContain('"id": 199');
    expect(text).not.toContain('"id": 249');
  });

  it("renders accessible successful, slow, failed, and empty database states", async () => {
    const { container, rerender } = render(
      <DebugPanel panel="database" record={fullRecord} />,
    );
    expect(screen.getByText(/all — Succeeded — Slow/)).toBeInTheDocument();
    expect(screen.getByText(/all — Failed/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("no such table");
    expect(screen.getByText(/\[REDACTED\]/)).toBeInTheDocument();
    expect(
      (await axe(container)).violations.filter(
        ({ impact }) => impact === "serious" || impact === "critical",
      ),
    ).toEqual([]);
    rerender(
      <DebugPanel
        panel="database"
        record={{ ...fullRecord, collectors: { database: [] } }}
      />,
    );
    expect(screen.getByText("No database data collected.")).toBeInTheDocument();
  });

  it("has no serious or critical automated accessibility violations", async () => {
    const { container } = await renderToolbar();
    await userEvent.click(screen.getByRole("button", { name: /Debugbar GET/ }));
    await userEvent.selectOptions(
      screen.getByLabelText("Debug request"),
      "one",
    );
    const results = await axe(container);
    expect(
      results.violations.filter(
        ({ impact }) => impact === "serious" || impact === "critical",
      ),
    ).toEqual([]);
  });
});
