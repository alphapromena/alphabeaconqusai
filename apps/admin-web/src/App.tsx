import { useState } from "react";
import { ReviewQueue } from "./pages/ReviewQueue.js";
import { Settings } from "./pages/Settings.js";

export function App() {
  const [tab, setTab] = useState<"review" | "settings">("review");
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#14131A", maxWidth: 920, margin: "0 auto", padding: "2rem 1.25rem" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.6rem", margin: 0 }}>
          Alpha<span style={{ color: "#FF1E57" }}>Beacon</span>
        </h1>
        <nav style={{ display: "flex", gap: 4 }}>
          <TabButton active={tab === "review"} onClick={() => setTab("review")}>Review queue</TabButton>
          <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>Settings</TabButton>
        </nav>
      </header>
      {tab === "review" ? <ReviewQueue /> : <Settings />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "0.35rem 0.8rem", borderRadius: 7, fontSize: 13, cursor: "pointer",
        border: active ? "1px solid #FF1E57" : "1px solid transparent",
        background: active ? "#FFEAF0" : "transparent", color: active ? "#D11048" : "#8A8893", fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}
