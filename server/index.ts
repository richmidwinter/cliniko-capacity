/**
 * Cliniko API proxy.
 *
 * The Cliniko API does not support CORS, so the browser can't call it directly.
 * This tiny server exists only to relay whitelisted GET requests (following
 * Cliniko's pagination). It holds NO credentials: the client sends the Cliniko
 * API key on each request via the `X-Cliniko-Api-Key` header, and we derive the
 * shard from the key's suffix (e.g. "…-uk2").
 *
 * .env:
 *   PORT=5281                 (optional)
 */
import "dotenv/config";
import express from "express";

const app = express();
const PORT = Number(process.env.PORT ?? 5281);

interface Creds {
  base: string;
  auth: string;
}

/** Build Cliniko base URL + Basic auth from a client-supplied API key. */
function credsFromKey(apiKey: string | undefined): Creds {
  if (!apiKey) {
    throw Object.assign(new Error("Missing Cliniko API key"), { status: 401 });
  }
  const shard = apiKey.includes("-") ? apiKey.slice(apiKey.lastIndexOf("-") + 1) : "";
  if (!/^[a-z]{2}\d+$/.test(shard)) {
    throw Object.assign(
      new Error("Cliniko API key is missing its shard suffix (e.g. '…-uk2')"),
      { status: 401 },
    );
  }
  return {
    base: `https://api.${shard}.cliniko.com/v1`,
    auth: "Basic " + Buffer.from(`${apiKey}:`).toString("base64"),
  };
}

/** Endpoints the frontend is allowed to hit. */
const ALLOWED = new Set([
  "practitioners",
  "individual_appointments",
  "appointment_types",
  "unavailable_blocks",
  "daily_availabilities",
  "businesses",
  "patients",
]);

/** Per-page timeout so a single slow/stuck Cliniko response can't hang the walk. */
const PAGE_TIMEOUT_MS = 20_000;

async function clinikoGet(creds: Creds, path: string, search: URLSearchParams) {
  const url = `${creds.base}/${path}?${search.toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: creds.auth,
        Accept: "application/json",
        "User-Agent": "CapacityDashboard (support@example.com)",
      },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
  } catch (e: any) {
    if (e?.name === "TimeoutError") {
      throw Object.assign(
        new Error(`Cliniko '${path}' timed out after ${PAGE_TIMEOUT_MS / 1000}s`),
        { status: 504 },
      );
    }
    throw e;
  }
  if (res.status === 429) {
    // Cliniko rate limit: 200 requests/minute. Back off and retry once.
    const wait = Number(res.headers.get("Retry-After") ?? 5) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return clinikoGet(creds, path, search);
  }
  if (!res.ok) {
    const body = await res.text();
    throw Object.assign(new Error(`Cliniko ${res.status}: ${body}`), { status: res.status });
  }
  return res.json() as Promise<any>;
}

/**
 * GET /api/cliniko/:resource
 * Query params are forwarded (q[], sort, etc.). Automatically walks
 * Cliniko's `links.next` pagination and returns the concatenated list.
 */
app.get("/api/cliniko/:resource", async (req, res) => {
  const resource = req.params.resource;
  if (!ALLOWED.has(resource)) {
    return res.status(400).json({ error: `Resource '${resource}' not allowed` });
  }
  try {
    const creds = credsFromKey(req.header("x-cliniko-api-key"));
    // Express's query parser strips the brackets from `q[]`, leaving key `q`
    // with an array value. Cliniko REQUIRES the `q[]` form for its filters
    // (repeated params), so re-append array params with the `[]` suffix.
    // Without this, filters are silently ignored and Cliniko returns the
    // entire unfiltered history.
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      const key = k.endsWith("[]") ? k : `${k}[]`;
      if (Array.isArray(v)) v.forEach((x) => params.append(key, String(x)));
      else if (v != null) params.append(k, String(v));
    }
    if (!params.has("per_page")) params.set("per_page", "100");

    let page = await clinikoGet(creds, resource, params);
    const key = Object.keys(page).find((k) => Array.isArray(page[k])) ?? resource;
    const items: any[] = [...(page[key] ?? [])];

    // Follow pagination
    let guard = 0;
    while (page.links?.next && guard++ < 200) {
      const next = new URL(page.links.next);
      page = await clinikoGet(creds, resource, next.searchParams);
      items.push(...(page[key] ?? []));
    }

    res.json({ items });
  } catch (err: any) {
    console.error(err);
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Cliniko proxy listening on :${PORT}`));
