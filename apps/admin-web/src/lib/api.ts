import type { Draft } from "@alphabeacon/shared";

const BASE = import.meta.env.VITE_API_URL ?? "";

/** Thin API client for the admin app. Endpoints are served by services/backend. */
export const api = {
  async listDrafts(runId?: string): Promise<Draft[]> {
    const res = await fetch(`${BASE}/drafts${runId ? `?runId=${runId}` : ""}`);
    const data = await res.json();
    return data.drafts ?? [];
  },
  async publish(tenantId: string, draftId: string) {
    return post("/publish", { tenantId, draftId });
  },
  async onDemand(tenantId: string, instruction: string) {
    return post("/on-demand", { tenantId, instruction });
  },
  async feedback(tenantId: string, draftId: string, rating: "up" | "down", comment?: string) {
    return post("/feedback", { tenantId, draftId, rating, comment });
  },
};

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
