import type { DailyAvailability, Practitioner, Settings } from "../lib/types";
import { defaultPractitionerSettings } from "../lib/settings";
import { fmtHours, weeklyOpenHours } from "../lib/metrics";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  settings: Settings;
  practitioners: Practitioner[];
  availabilities: DailyAvailability[];
  onChange: (s: Settings) => void;
  onClose: () => void;
}

export function SettingsPanel({ settings, practitioners, availabilities, onChange, onClose }: Props) {
  const openHours = weeklyOpenHours(availabilities);
  const setPct = (key: "capacityTarget" | "conversionTarget") =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...settings, [key]: Number(e.target.value) / 100 });

  const setPrac = (id: string, patch: Partial<Settings["practitioners"][string]>) =>
    onChange({
      ...settings,
      practitioners: {
        ...settings.practitioners,
        [id]: { ...(settings.practitioners[id] ?? defaultPractitionerSettings()), ...patch },
      },
    });

  return (
    <div className="settings">
      <div className="settings-head">
        <h2>Settings</h2>
        <button onClick={onClose}>Done</button>
      </div>

      <div className="settings-grid">
        <label>
          Capacity target %
          <input type="number" min={0} max={200} value={Math.round(settings.capacityTarget * 100)} onChange={setPct("capacityTarget")} />
        </label>
        <label>
          Conversion target %
          <input type="number" min={0} max={200} value={Math.round(settings.conversionTarget * 100)} onChange={setPct("conversionTarget")} />
        </label>
        <label className="wide">
          New-patient appointment type contains (comma separated)
          <input
            type="text"
            value={settings.newPatientPatterns.join(", ")}
            onChange={(e) => onChange({ ...settings, newPatientPatterns: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          />
        </label>
      </div>

      <h3>Weekly open hours</h3>
      <p className="hint">
        Read from each clinician's Cliniko profile availability (hours open per weekday).
        Unavailable blocks are subtracted automatically. Clinicians with no Cliniko availability
        fall back to default hours, marked with *.
      </p>
      <table className="roster">
        <thead>
          <tr>
            <th>Clinician</th>
            <th>Include</th>
            {DAY_LABELS.map((d) => (
              <th key={d}>{d}</th>
            ))}
            <th>Total</th>
            <th>Target %</th>
          </tr>
        </thead>
        <tbody>
          {practitioners.map((p) => {
            const ps = settings.practitioners[p.id] ?? defaultPractitionerSettings();
            const fromCliniko = openHours.has(p.id);
            const hours = openHours.get(p.id) ?? ps.roster;
            const total = hours.reduce((t, h) => t + h, 0);
            return (
              <tr key={p.id}>
                <th>
                  {p.first_name} {p.last_name}
                  {!fromCliniko && <span className="hint" title="No Cliniko availability — using default hours"> *</span>}
                </th>
                <td>
                  <input type="checkbox" checked={ps.include} onChange={(e) => setPrac(p.id, { include: e.target.checked })} />
                </td>
                {hours.map((h, i) => (
                  <td key={i} className={h === 0 ? "cell-na" : undefined}>{h === 0 ? "—" : fmtHours(h)}</td>
                ))}
                <td>{fmtHours(total)}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={Math.round(ps.capacityTarget * 100)}
                    onChange={(e) => setPrac(p.id, { capacityTarget: Number(e.target.value) / 100 })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
