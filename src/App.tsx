import { useEffect, useMemo, useState } from "react";
import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import {
  ApiKeyError,
  fetchAppointmentTypes,
  fetchAppointments,
  fetchDailyAvailabilities,
  fetchPractitioners,
  fetchUnavailableBlocks,
} from "./api/cliniko";
import { clearApiKey, getApiKey, setApiKey } from "./lib/apiKey";
import { computeDashboard } from "./lib/metrics";
import { ensurePractitioners, loadSettings, saveSettings } from "./lib/settings";
import type {
  Appointment,
  AppointmentType,
  DailyAvailability,
  Practitioner,
  Settings,
  UnavailableBlock,
} from "./lib/types";
import { ApiKeyPrompt } from "./components/ApiKeyPrompt";
import { MetricsBlock } from "./components/MetricsBlock";
import { SettingsPanel } from "./components/SettingsPanel";

type LoadState = "idle" | "loading" | "ready" | "error";
type Progress = { current: number; total: number; label: string };

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [blocks, setBlocks] = useState<UnavailableBlock[]>([]);
  const [availabilities, setAvailabilities] = useState<DailyAvailability[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [hasKey, setHasKey] = useState(() => !!getApiKey());
  const [keyError, setKeyError] = useState("");

  const updateSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };

  const load = async () => {
    setState("loading");
    setError("");
    // Load only the viewed month plus the following month — the extra month lets
    // us detect follow-up appointments booked shortly after a new-patient visit.
    const from = startOfMonth(viewMonth);
    const to = endOfMonth(addMonths(viewMonth, 1));

    // Run one request at a time so we can show real progress and stay well
    // under Cliniko's 200-req/min rate limit.
    let pracs: Practitioner[] = [];
    const steps: { label: string; run: () => Promise<void> }[] = [
      { label: "Practitioners", run: async () => setPractitioners((pracs = await fetchPractitioners())) },
      { label: "Appointments", run: async () => setAppointments(await fetchAppointments(from, to)) },
      { label: "Appointment types", run: async () => setTypes(await fetchAppointmentTypes()) },
      { label: "Unavailable blocks", run: async () => setBlocks(await fetchUnavailableBlocks(from, to)) },
      { label: "Availability", run: async () => setAvailabilities(await fetchDailyAvailabilities()) },
    ];

    try {
      for (let i = 0; i < steps.length; i++) {
        setProgress({ current: i, total: steps.length, label: steps[i].label });
        await steps[i].run();
      }
      setProgress({ current: steps.length, total: steps.length, label: "Done" });
      setSettings((s) => {
        const next = ensurePractitioners(s, pracs);
        saveSettings(next);
        return next;
      });
      setRefreshedAt(new Date());
      setState("ready");
    } catch (e: any) {
      if (e instanceof ApiKeyError) {
        // Missing or rejected key: drop it and re-prompt.
        clearApiKey();
        setHasKey(false);
        setKeyError(e.message ?? "Cliniko rejected the API key");
        setState("idle");
      } else {
        setError(e.message ?? String(e));
        setState("error");
      }
    } finally {
      setProgress(null);
    }
  };

  const submitKey = (key: string) => {
    setApiKey(key);
    setKeyError("");
    setHasKey(true);
  };

  useEffect(() => {
    if (hasKey) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMonth, hasKey]);

  // Re-prompt if the key disappears from localStorage (e.g. cleared elsewhere).
  useEffect(() => {
    const onStorage = () => {
      if (!getApiKey()) setHasKey(false);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const data = useMemo(() => {
    if (state !== "ready") return null;
    return computeDashboard(practitioners, appointments, types, blocks, availabilities, settings, viewMonth);
  }, [state, practitioners, appointments, types, blocks, availabilities, settings, viewMonth]);

  return (
    <div className="app">
      {!hasKey && <ApiKeyPrompt error={keyError} onSubmit={submitKey} />}
      <header>
        <div>
          <h1>Clinic capacity</h1>
          {refreshedAt && <span className="refreshed">Updated {refreshedAt.toLocaleTimeString()}</span>}
        </div>
        <div className="actions">
          <button onClick={load} disabled={state === "loading"}>
            {state === "loading" ? "Loading…" : "Refresh"}
          </button>
          <button onClick={() => setShowSettings((v) => !v)}>Settings</button>
        </div>
      </header>

      {progress && (
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.current}>
          <div className="progress-bar" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
          <span className="progress-label">
            {progress.current < progress.total
              ? `Loading ${progress.label}… (step ${progress.current + 1} of ${progress.total})`
              : "Done"}
          </span>
        </div>
      )}

      <div className="legend">
        <span className="chip cell-good">On target</span>
        <span className="chip cell-warn">Below target</span>
        <span className="chip cell-bad">Well below</span>
        <span className="chip cell-over">Over capacity</span>
        <span className="chip cell-future">Future</span>
      </div>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          practitioners={practitioners}
          availabilities={availabilities}
          onChange={updateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {state === "error" && (
        <div className="error">
          Couldn't load data from Cliniko: {error}. Check the proxy is running and the API key in .env is valid.
        </div>
      )}

      {state !== "error" && (
        <div className="month-nav">
          <button
            onClick={() => setViewMonth((m) => addMonths(m, -1))}
            disabled={state === "loading"}
            aria-label="Previous month"
          >
            ‹ Prev
          </button>
          <span className="month-nav-label">{format(viewMonth, "MMMM yyyy")}</span>
          <button
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
            disabled={state === "loading"}
            aria-label="Next month"
          >
            Next ›
          </button>
        </div>
      )}

      {data && (
        <>
          <MetricsBlock
            title="Whole clinic"
            months={data.months}
            capacityTarget={settings.capacityTarget}
            conversionTarget={settings.conversionTarget}
            showPatients
          />
          {data.perPractitioner.map((pm) => (
            <MetricsBlock
              key={pm.practitioner.id}
              title={`${pm.practitioner.first_name} ${pm.practitioner.last_name}`}
              months={pm.months}
              capacityTarget={settings.practitioners[pm.practitioner.id]?.capacityTarget ?? settings.capacityTarget}
              conversionTarget={settings.conversionTarget}
              showPatients
            />
          ))}
        </>
      )}
    </div>
  );
}
