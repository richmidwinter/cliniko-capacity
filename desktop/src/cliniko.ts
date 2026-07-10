/**
 * Cliniko fetch logic for the Electron main process (Node — no CORS).
 * Mirrors the web proxy in ../../server/index.ts: derive the shard from the
 * client-supplied API key, walk pagination, and only allow whitelisted resources.
 */

/** Endpoints the renderer is allowed to hit. */
const ALLOWED = new Set([
  "practitioners",
  "individual_appointments",
  "appointment_types",
  "unavailable_blocks",
  "daily_availabilities",
  "businesses",
  "patients",
]);

const PAGE_TIMEOUT_MS = 20_000;

interface Creds {
  base: string;
  auth: string;
}

function credsFromKey(apiKey: string): Creds {
  if (!apiKey) throw Object.assign(new Error("Missing Cliniko API key"), { status: 401 });
  const shard = apiKey.includes("-") ? apiKey.slice(apiKey.lastIndexOf("-") + 1) : "";
  if (!/^[a-z]{2}\d+$/.test(shard)) {
    throw Object.assign(new Error("Cliniko API key is missing its shard suffix (e.g. '…-uk2')"), {
      status: 401,
    });
  }
  return {
    base: `https://api.${shard}.cliniko.com/v1`,
    auth: "Basic " + Buffer.from(`${apiKey}:`).toString("base64"),
  };
}

async function fetchPage(creds: Creds, path: string, search: URLSearchParams): Promise<any> {
  const url = `${creds.base}/${path}?${search.toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: creds.auth,
        Accept: "application/json",
        "User-Agent": "CapacityDashboard (desktop)",
      },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
  } catch (e: any) {
    if (e?.name === "TimeoutError") {
      throw Object.assign(new Error(`Cliniko '${path}' timed out after ${PAGE_TIMEOUT_MS / 1000}s`), {
        status: 504,
      });
    }
    throw e;
  }
  if (res.status === 429) {
    const wait = Number(res.headers.get("Retry-After") ?? 5) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return fetchPage(creds, path, search);
  }
  if (!res.ok) {
    const body = await res.text();
    throw Object.assign(new Error(`Cliniko ${res.status}: ${body}`), { status: res.status });
  }
  return res.json();
}

/** Fetch all pages of a resource, returning the concatenated items. */
export async function clinikoGetAll(
  resource: string,
  params: Record<string, string | string[]>,
  apiKey: string,
): Promise<any[]> {
  if (!ALLOWED.has(resource)) {
    throw Object.assign(new Error(`Resource '${resource}' not allowed`), { status: 400 });
  }
  const creds = credsFromKey(apiKey);

  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => search.append(k, String(x)));
    else if (v != null) search.append(k, String(v));
  }
  if (!search.has("per_page")) search.set("per_page", "100");

  let page = await fetchPage(creds, resource, search);
  const key = Object.keys(page).find((k) => Array.isArray(page[k])) ?? resource;
  const items: any[] = [...(page[key] ?? [])];

  let guard = 0;
  while (page.links?.next && guard++ < 200) {
    const next = new URL(page.links.next);
    page = await fetchPage(creds, resource, next.searchParams);
    items.push(...(page[key] ?? []));
  }
  return items;
}
