import { Fragment } from "react";
import { fmtHours, fmtPct, pct } from "../lib/metrics";
import type { MonthMetrics, Settings } from "../lib/types";

type RowKind = "hours" | "pct";

/** Plain-language explanations + corner cases, shown as tooltips on each metric name. */
const TIP = {
  available:
    "Open diary hours from each practitioner's Cliniko profile availability " +
    "(hours-per-weekday × the number of those weekdays in the month). " +
    "Proj = the whole month; Actual = elapsed weeks only. " +
    "Unavailable blocks / time off are NOT subtracted.",
  filled:
    "Booked diary hours: attended appointments plus did-not-arrive (a no-show still " +
    "holds the slot, so the practitioner isn't penalised). Cancelled appointments are " +
    "NOT counted — the slot was freed (this matches Cliniko's own reporting). " +
    "Overlapping appointments in one diary are counted once " +
    "(e.g. 09:00–10:00 + 09:30–10:30 = 1.5h, not 2h). " +
    "Proj includes future bookings for the whole month; Actual counts elapsed weeks only.",
  cancelled:
    "Hours that were booked then cancelled. Informational only — NOT included in " +
    "Hours filled or Utilisation, because the slot was freed for rebooking. " +
    "Unioned per diary like Hours filled.",
  dna:
    "Of the filled hours, the portion the patient did not arrive for (no-show). " +
    "These ARE included in Hours filled and Utilisation (the slot was still held). " +
    "Informational breakdown; unioned per diary.",
  capacity:
    "Hours filled ÷ Available hours — how full the diary was. " +
    "Attended and did-not-arrive count; cancelled does not. " +
    "Colour vs target: green ≥ target, amber up to 25% below, red well below, purple over 100%.",
  newPatients:
    "Appointments whose type name matches the new-patient patterns in Settings " +
    "(e.g. “NEW …” and assessment types). " +
    "Excludes cancelled and did-not-arrive appointments.",
  followUp:
    "Of the new patients this month, how many have any later appointment booked, with any practitioner. " +
    "A phone call or a did-not-arrive appointment DOES count. " +
    "Only follow-ups within the loaded window (this month + the following month) are detected, " +
    "so a follow-up booked further out may be missed.",
  conversion:
    "New patient with follow up ÷ New patients — " +
    "the share of new patients who have a subsequent appointment booked.",
};

/** Metric row name with an info tooltip (hover/focus). */
function MetricName({ name, tip }: { name: string; tip: string }) {
  return (
    <span className="metric-name">
      {name}
      <span className="info" title={tip} tabIndex={0} role="note" aria-label={`${name}: ${tip}`}>
        &#9432;
      </span>
    </span>
  );
}

/** Traffic-light class for a percentage vs target. */
function ragClass(value: number | null, target: number, over = 1.0): string {
  if (value == null) return "cell-na";
  if (value > over) return "cell-over"; // over capacity / >100%
  if (value >= target) return "cell-good";
  if (value >= target * 0.75) return "cell-warn";
  return "cell-bad";
}

interface BlockProps {
  title: string;
  months: MonthMetrics[];
  capacityTarget: number;
  conversionTarget: number;
  showPatients: boolean;
}

export function MetricsBlock({ title, months, capacityTarget, conversionTarget, showPatients }: BlockProps) {
  const cols: { key: string; label: string; cls?: string }[] = [];
  for (const m of months) {
    cols.push({ key: `${m.key}-proj`, label: `${m.label} Proj`, cls: "col-proj" });
    m.weeks.forEach((w) => cols.push({ key: `${m.key}-${w.label}`, label: `${m.label} ${w.label}` }));
    cols.push({ key: `${m.key}-act`, label: `${m.label} Actual`, cls: "col-actual" });
  }

  const cellsFor = (
    weekVal: (m: MonthMetrics, wi: number) => string,
    projVal: (m: MonthMetrics) => string,
    actVal: (m: MonthMetrics) => string,
    cellCls?: (m: MonthMetrics, wi: number | null, isProj: boolean) => string,
  ) =>
    months.map((m) => (
      <Fragment key={m.key}>
        <td className={`col-proj ${cellCls?.(m, null, true) ?? ""}`}>{projVal(m)}</td>
        {m.weeks.map((w, wi) => (
          // Future weeks still show their values (rostered hours, bookings so far,
          // etc.), but keep the neutral "future" shade rather than a traffic-light
          // colour, since the week isn't complete yet.
          <td key={w.label} className={w.isFuture ? "cell-future" : cellCls?.(m, wi, false) ?? ""}>
            {weekVal(m, wi)}
          </td>
        ))}
        <td className={`col-actual ${m.isFuture ? "cell-future" : cellCls?.(m, -1, false) ?? ""}`}>
          {actVal(m)}
        </td>
      </Fragment>
    ));

  const capacityCls = (m: MonthMetrics, wi: number | null, isProj: boolean) => {
    let v: number | null;
    if (isProj) v = pct(m.projected.filledHours, m.projected.availableHours);
    else if (wi === -1) v = pct(m.actual.filledHours, m.actual.availableHours);
    else v = pct(m.weeks[wi!].filledHours, m.weeks[wi!].availableHours);
    return ragClass(v, capacityTarget);
  };

  const conversionCls = (m: MonthMetrics, wi: number | null, isProj: boolean) => {
    let v: number | null;
    if (isProj) v = null;
    else if (wi === -1) v = pct(m.actual.followUpsBooked, m.actual.newPatients);
    else v = pct(m.weeks[wi!].followUpsBooked, m.weeks[wi!].newPatients);
    return isProj ? "cell-na" : ragClass(v, conversionTarget);
  };

  return (
    <section className="block">
      <h2>{title}</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="sticky-col">Metric</th>
              <th>Target</th>
              {cols.map((c) => (
                <th key={c.key} className={c.cls}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className="sticky-col"><MetricName name="Available hours" tip={TIP.available} /></th>
              <td></td>
              {cellsFor(
                (m, wi) => fmtHours(m.weeks[wi].availableHours),
                (m) => fmtHours(m.projected.availableHours),
                (m) => fmtHours(m.actual.availableHours),
              )}
            </tr>
            <tr>
              <th className="sticky-col"><MetricName name="Hours filled" tip={TIP.filled} /></th>
              <td></td>
              {cellsFor(
                (m, wi) => fmtHours(m.weeks[wi].filledHours),
                (m) => fmtHours(m.projected.filledHours),
                (m) => fmtHours(m.actual.filledHours),
              )}
            </tr>
            <tr>
              <th className="sticky-col"><MetricName name="DNA hours" tip={TIP.dna} /></th>
              <td></td>
              {cellsFor(
                (m, wi) => fmtHours(m.weeks[wi].dnaHours),
                (m) => fmtHours(m.projected.dnaHours),
                (m) => fmtHours(m.actual.dnaHours),
              )}
            </tr>
            <tr className="row-pct">
              <th className="sticky-col"><MetricName name="Utilisation" tip={TIP.capacity} /></th>
              <td className="target">{fmtPct(capacityTarget)}</td>
              {cellsFor(
                (m, wi) => fmtPct(pct(m.weeks[wi].filledHours, m.weeks[wi].availableHours)),
                (m) => fmtPct(pct(m.projected.filledHours, m.projected.availableHours)),
                (m) => fmtPct(pct(m.actual.filledHours, m.actual.availableHours)),
                capacityCls,
              )}
            </tr>
            <tr>
              <th className="sticky-col"><MetricName name="Cancelled hours" tip={TIP.cancelled} /></th>
              <td></td>
              {cellsFor(
                (m, wi) => fmtHours(m.weeks[wi].cancelledHours),
                (m) => fmtHours(m.projected.cancelledHours),
                (m) => fmtHours(m.actual.cancelledHours),
              )}
            </tr>
            {showPatients && (
              <>
                <tr>
                  <th className="sticky-col"><MetricName name="New patients" tip={TIP.newPatients} /></th>
                  <td></td>
                  {cellsFor(
                    (m, wi) => String(m.weeks[wi].newPatients),
                    () => "",
                    (m) => String(m.actual.newPatients),
                  )}
                </tr>
                <tr>
                  <th className="sticky-col"><MetricName name="New patient with follow up" tip={TIP.followUp} /></th>
                  <td></td>
                  {cellsFor(
                    (m, wi) => String(m.weeks[wi].followUpsBooked),
                    () => "",
                    (m) => String(m.actual.followUpsBooked),
                  )}
                </tr>
                <tr className="row-pct">
                  <th className="sticky-col"><MetricName name="Conversion %" tip={TIP.conversion} /></th>
                  <td className="target">{fmtPct(conversionTarget)}</td>
                  {cellsFor(
                    (m, wi) => fmtPct(pct(m.weeks[wi].followUpsBooked, m.weeks[wi].newPatients)),
                    () => "",
                    (m) => fmtPct(pct(m.actual.followUpsBooked, m.actual.newPatients)),
                    conversionCls,
                  )}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export type { RowKind };
export type SettingsProp = Settings;
