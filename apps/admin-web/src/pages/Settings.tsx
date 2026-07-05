import { useEffect, useState } from "react";
import type { Source, TenantConfig } from "@alphabeacon/shared";
import { api } from "../lib/api.js";

/** Edit the tenant's schedule, standing topics, and followed sources. */
export function Settings() {
  const [cfg, setCfg] = useState<TenantConfig | null>(null);
  const [topics, setTopics] = useState("");
  const [keywords, setKeywords] = useState("");
  const [time, setTime] = useState("14:00");
  const [tz, setTz] = useState("Asia/Amman");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getConfig().then((c) => {
      if (c) {
        setCfg(c);
        setTopics(c.topics.join("\n"));
        setKeywords(c.sources.filter((s) => s.kind === "keyword").map((s) => s.value).join("\n"));
        setTime(c.schedule?.time ?? "14:00");
        setTz(c.schedule?.timezone ?? "Asia/Amman");
      }
      setLoading(false);
    });
  }, []);

  if (!api.hasBackend) return <p style={{ color: "#8A8893" }}>Settings need the deployed backend (no API configured in this build).</p>;
  if (loading) return <p style={{ color: "#8A8893" }}>Loading config…</p>;
  if (!cfg) return <p style={{ color: "#8A8893" }}>No config found for this tenant yet.</p>;

  async function save() {
    if (!cfg) return;
    // Keep non-keyword sources; rebuild the keyword sources from the textarea.
    const nonKeyword = cfg.sources.filter((s) => s.kind !== "keyword");
    const kw: Source[] = keywords
      .split("\n").map((v) => v.trim()).filter(Boolean)
      .map((value, i) => ({ id: `kw-${i}`, kind: "keyword" as const, value }));
    const next: TenantConfig = {
      ...cfg,
      schedule: { time, timezone: tz },
      topics: topics.split("\n").map((t) => t.trim()).filter(Boolean),
      sources: [...nonKeyword, ...kw],
    };
    setMsg("Saving…");
    await api.putConfig(next).catch(() => {});
    setCfg(next);
    setMsg("Saved. Applies on the next run.");
  }

  return (
    <div style={{ display: "grid", gap: "1.1rem", maxWidth: 640 }}>
      <Field label="Daily run time (24h) + timezone">
        <div style={{ display: "flex", gap: 8 }}>
          <input value={time} onChange={(e) => setTime(e.target.value)} style={input} />
          <input value={tz} onChange={(e) => setTz(e.target.value)} style={{ ...input, flex: 1 }} />
        </div>
      </Field>
      <Field label="Standing topics (one per line)">
        <textarea value={topics} onChange={(e) => setTopics(e.target.value)} rows={5} style={input} />
      </Field>
      <Field label="Keyword sources to watch (one per line)">
        <textarea value={keywords} onChange={(e) => setKeywords(e.target.value)} rows={6} style={input} />
      </Field>
      <div style={{ fontSize: 12, color: "#8A8893" }}>
        {cfg.sources.filter((s) => s.kind !== "keyword").length} feed/blog sources are also configured (edited in code).
      </div>
      <div>
        <button style={{ padding: "0.55rem 1rem", borderRadius: 8, border: "1px solid #FF1E57", background: "#FF1E57", color: "#fff", fontWeight: 600, cursor: "pointer" }} onClick={save}>
          Save settings
        </button>
        {msg && <span style={{ marginLeft: 12, fontSize: 13, color: "#0a7a3f" }}>{msg}</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#4E4C57" }}>{label}</span>
      {children}
    </label>
  );
}
const input: React.CSSProperties = { padding: "0.5rem 0.7rem", borderRadius: 8, border: "1px solid #d9d6df", fontSize: 14, fontFamily: "inherit" };
