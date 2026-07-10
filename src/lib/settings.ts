import type { Practitioner, Settings, PractitionerSettings } from "./types";

const KEY = "capacity-dashboard-settings-v1";

export const defaultPractitionerSettings = (): PractitionerSettings => ({
  roster: [7.5, 7.5, 7.5, 7.5, 7.5, 0, 0],
  capacityTarget: 0.85,
  include: true,
});

/** Superseded default pattern sets, auto-migrated to the current default on load. */
const SUPERSEDED_NEW_PATIENT_PATTERNS = [
  ["new patient", "initial", "first appointment"], // original: matched nothing here
  ["new", "initial", "first appointment"], // interim: missed "… Assessment" types
];

export const defaultSettings = (): Settings => ({
  capacityTarget: 0.85,
  conversionTarget: 0.85,
  // Substrings matched (case-insensitive) against the appointment-type name.
  // "new" catches the clinic's "NEW …" types; "assessment" catches the
  // physiotherapy assessment types that are also new-patient appointments.
  newPatientPatterns: ["new", "initial", "first appointment", "assessment"],
  practitioners: {},
});

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw);
    const merged = { ...defaultSettings(), ...parsed } as Settings;
    // Upgrade any superseded default pattern set to the current default,
    // unless the user has customised them.
    const p = parsed.newPatientPatterns;
    const isSuperseded =
      Array.isArray(p) &&
      SUPERSEDED_NEW_PATIENT_PATTERNS.some(
        (old) => old.length === p.length && old.every((x, i) => x === p[i]),
      );
    if (isSuperseded) {
      merged.newPatientPatterns = defaultSettings().newPatientPatterns;
    }
    return merged;
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** Ensure every fetched practitioner has a settings entry. */
export function ensurePractitioners(s: Settings, practitioners: Practitioner[]): Settings {
  const next = { ...s, practitioners: { ...s.practitioners } };
  for (const p of practitioners) {
    if (!next.practitioners[p.id]) {
      next.practitioners[p.id] = { ...defaultPractitionerSettings(), include: p.active };
    }
  }
  return next;
}
