import { ReviewQueue } from "./pages/ReviewQueue.js";

export function App() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#14131A", maxWidth: 920, margin: "0 auto", padding: "2rem 1.25rem" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.6rem", margin: 0 }}>
          Alpha<span style={{ color: "#FF1E57" }}>Beacon</span>
        </h1>
        <span style={{ fontSize: 13, color: "#8A8893" }}>Daily review queue</span>
      </header>
      <ReviewQueue />
    </div>
  );
}
