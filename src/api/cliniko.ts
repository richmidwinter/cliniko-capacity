import { getApiKey } from "../lib/apiKey";
import type {
  Appointment,
  AppointmentType,
  DailyAvailability,
  Practitioner,
  UnavailableBlock,
} from "../lib/types";

/** Thrown when the Cliniko API key is missing or rejected, so the UI can re-prompt. */
export class ApiKeyError extends Error {}

/** Abort a request if the proxy hasn't responded within this window. */
const REQUEST_TIMEOUT_MS = 90_000;

type BridgeResult =
  | { ok: true; items: unknown[] }
  | { ok: false; status: number; error: string };

/** Present in the Electron build (via preload); absent on the web. */
interface ClinikoBridge {
  get(resource: string, params: Record<string, string | string[]>, apiKey: string): Promise<BridgeResult>;
}

async function get<T>(resource: string, params: Record<string, string | string[]> = {}): Promise<T[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new ApiKeyError("No Cliniko API key");

  // Electron build: the main process does the fetch (no CORS, no proxy server).
  const bridge = (window as unknown as { cliniko?: ClinikoBridge }).cliniko;
  if (bridge) {
    const result = await bridge.get(resource, params, apiKey);
    if (!result.ok) {
      if (result.status === 401 || result.status === 403) throw new ApiKeyError(result.error);
      throw new Error(result.error);
    }
    return result.items as T[];
  }

  // Web: go through the local HTTP proxy.
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => search.append(k, x));
    else search.append(k, v);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`/api/cliniko/${resource}?${search.toString()}`, {
      signal: ctrl.signal,
      headers: { "X-Cliniko-Api-Key": apiKey },
    });
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(`${resource} timed out after ${REQUEST_TIMEOUT_MS / 1000}s — try a smaller date range`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) {
    const body = await res.json().catch(() => ({}));
    throw new ApiKeyError(body.error ?? "Cliniko rejected the API key");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  const data = await res.json();
  return data.items as T[];
}

export const idFromLink = (link?: string) => link?.split("/").pop() ?? "";

export function fetchPractitioners() {
  return get<Practitioner>("practitioners");
}

export function fetchAppointmentTypes() {
  return get<AppointmentType>("appointment_types");
}

/**
 * Individual appointments in [from, to). `cancelled_at:*` makes Cliniko include
 * cancelled appointments (excluded by default) so we can report cancelled hours;
 * they are kept out of filled hours in the metrics.
 */
export function fetchAppointments(from: Date, to: Date) {
  return get<Appointment>("individual_appointments", {
    "q[]": [
      `starts_at:>${from.toISOString()}`,
      `starts_at:<${to.toISOString()}`,
      "cancelled_at:*",
    ],
    sort: "starts_at",
  });
}

/** Per-practitioner weekly "hours open" from their Cliniko profile. */
export function fetchDailyAvailabilities() {
  return get<DailyAvailability>("daily_availabilities");
}

export function fetchUnavailableBlocks(from: Date, to: Date) {
  return get<UnavailableBlock>("unavailable_blocks", {
    "q[]": [
      `starts_at:>${from.toISOString()}`,
      `starts_at:<${to.toISOString()}`,
    ],
  });
}
