import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Debugbar, DebugbarProvider } from "@debugbar/react";

function App() {
  const [page, setPage] = useState("Home");
  const [result, setResult] = useState("No request made yet.");

  async function request(path: string) {
    const response = await fetch(path);
    const body = (await response.json()) as {
      message?: string;
      error?: string;
    };
    setResult(body.message ?? body.error ?? `HTTP ${response.status}`);
  }

  return (
    <DebugbarProvider>
      <main style={{ fontFamily: "system-ui", margin: "2rem", maxWidth: 720 }}>
        <h1>Express + React Debugbar</h1>
        <nav aria-label="Example pages">
          <button type="button" onClick={() => setPage("Home")}>
            Home
          </button>{" "}
          <button type="button" onClick={() => setPage("Reports")}>
            Reports
          </button>
        </nav>
        <h2>{page}</h2>
        <p>Generate a server request, then inspect it in the debug toolbar.</p>
        <button type="button" onClick={() => void request("/api/success")}>
          Load success
        </button>{" "}
        <button type="button" onClick={() => void request("/api/failure")}>
          Load failure
        </button>{" "}
        <button type="button" onClick={() => void request("/api/users")}>
          Load users SQL
        </button>{" "}
        <button type="button" onClick={() => void request("/api/sql-error")}>
          Load SQL error
        </button>
        <output style={{ display: "block", marginTop: "1rem" }}>
          {result}
        </output>
      </main>
      <Debugbar />
    </DebugbarProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
