import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  max,
  min,
  startOfMonth,
  startOfWeek,
  addWeeks,
} from "date-fns";
import { idFromLink } from "../api/cliniko";
import type {
  Appointment,
  AppointmentType,
  DailyAvailability,
  DashboardData,
  MonthMetrics,
  Practitioner,
  Settings,
  UnavailableBlock,
  WeekMetrics,
} from "./types";

/** Monday-index (0=Mon..6=Sun) for a date. */
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;

/** Minutes since midnight for a "HH:MM" string. */
const minutesOfDay = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Per-practitioner open hours by Monday-index (0=Mon..6=Sun), taken from their
 * Cliniko profile availability (daily_availabilities), summing each day's windows.
 */
export function weeklyOpenHours(availabilities: DailyAvailability[]): Map<string, number[]> {
  const byPrac = new Map<string, number[]>();
  for (const a of availabilities) {
    const pid = idFromLink(a.practitioner?.links?.self);
    if (!pid) continue;
    // Cliniko day_of_week is 1=Mon..7=Sun; convert to 0=Mon..6=Sun.
    const dayIdx = (((a.day_of_week - 1) % 7) + 7) % 7;
    const hours = (a.availabilities ?? []).reduce(
      (t, w) => t + (minutesOfDay(w.ends_at) - minutesOfDay(w.starts_at)) / 60,
      0,
    );
    const arr = byPrac.get(pid) ?? [0, 0, 0, 0, 0, 0, 0];
    arr[dayIdx] += hours;
    byPrac.set(pid, arr);
  }
  return byPrac;
}

/** Append an interval to a per-practitioner interval map. */
function addInterval(m: Map<string, [number, number][]>, pid: string, iv: [number, number]) {
  const arr = m.get(pid);
  if (arr) arr.push(iv);
  else m.set(pid, [iv]);
}

/** Sum, across practitioners, the union length (hours) of their intervals. */
function sumUnionHours(m: Map<string, [number, number][]>): number {
  let total = 0;
  for (const intervals of m.values()) total += unionHours(intervals);
  return total;
}

/**
 * Total length (hours) of the union of [start,end) intervals (in ms), so
 * overlapping/double-booked appointments are counted once, e.g.
 * 09:00–10:00 + 09:30–10:30 = 1.5h, not 2h.
 */
function unionHours(intervals: [number, number][]): number {
  if (intervals.length === 0) return 0;
  intervals.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = intervals[0][0];
  let curEnd = intervals[0][1];
  for (let i = 1; i < intervals.length; i++) {
    const [s, e] = intervals[i];
    if (s > curEnd) {
      total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) {
      curEnd = e;
    }
  }
  total += curEnd - curStart;
  return total / 3_600_000;
}

/** Weeks in a month, ISO-style (Mon-Sun), clipped to the month. */
function weeksOfMonth(month: Date): { start: Date; end: Date }[] {
  const mStart = startOfMonth(month);
  const mEnd = endOfMonth(month);
  const weeks: { start: Date; end: Date }[] = [];
  let ws = startOfWeek(mStart, { weekStartsOn: 1 });
  while (isBefore(ws, mEnd)) {
    const we = addWeeks(ws, 1);
    weeks.push({ start: max([ws, mStart]), end: min([we, new Date(mEnd.getTime() + 1)]) });
    ws = we;
  }
  return weeks;
}

/**
 * Available hours for one practitioner over [start, end): their weekly open
 * hours (from the Cliniko profile) summed across each day in the range — i.e.
 * open-hours-per-weekday × the number of those weekdays that fall in the range.
 * Falls back to the manually-entered roster if no Cliniko availability is set.
 *
 * Note: unavailable_blocks are NOT subtracted here.
 */
function availableHoursFor(
  pracId: string,
  start: Date,
  end: Date,
  settings: Settings,
  openHours: Map<string, number[]>,
): number {
  const ps = settings.practitioners[pracId];
  if (!ps || !ps.include) return 0;
  const weekHours = openHours.get(pracId) ?? ps.roster;
  const days = eachDayOfInterval({ start, end: new Date(end.getTime() - 1) });
  let hours = 0;
  for (const day of days) {
    hours += weekHours[mondayIndex(day)] ?? 0;
  }
  return hours;
}

function isNewPatientAppt(
  appt: Appointment,
  typesById: Map<string, AppointmentType>,
  patterns: string[],
): boolean {
  const t = typesById.get(idFromLink(appt.appointment_type?.links?.self));
  if (!t) return false;
  const name = t.name.toLowerCase();
  return patterns.some((p) => name.includes(p.toLowerCase()));
}

export function computeDashboard(
  practitioners: Practitioner[],
  appointments: Appointment[],
  types: AppointmentType[],
  // Reserved for future time-off handling; not currently subtracted (see availableHoursFor).
  _blocks: UnavailableBlock[],
  availabilities: DailyAvailability[],
  settings: Settings,
  // The single month to report on. Appointments may include the following month
  // too, so cross-month follow-ups are still detected.
  month: Date,
  now = new Date(),
): DashboardData {
  const typesById = new Map(types.map((t) => [t.id, t]));
  const openHours = weeklyOpenHours(availabilities);
  const valid = appointments.filter((a) => !a.cancelled_at);

  // Index appointments by patient for follow-up detection
  const byPatient = new Map<string, Appointment[]>();
  for (const a of valid) {
    const pid = idFromLink(a.patient?.links?.self);
    if (!pid) continue;
    const arr = byPatient.get(pid) ?? [];
    arr.push(a);
    byPatient.set(pid, arr);
  }

  const hasFollowUp = (appt: Appointment): boolean => {
    const pid = idFromLink(appt.patient?.links?.self);
    const list = byPatient.get(pid) ?? [];
    return list.some((a) => a.id !== appt.id && isAfter(new Date(a.starts_at), new Date(appt.starts_at)));
  };

  const included = practitioners.filter((p) => settings.practitioners[p.id]?.include);

  const monthStarts: Date[] = [startOfMonth(month)];

  const buildMonths = (pracIds: string[]): MonthMetrics[] =>
    monthStarts.map((mStart) => {
      const mEnd = new Date(endOfMonth(mStart).getTime() + 1);
      const weeks: WeekMetrics[] = weeksOfMonth(mStart).map((w, i) => {
        const isFuture = isAfter(w.start, now);
        let availableHours = 0;
        let newPatients = 0;
        let followUpsBooked = 0;
        for (const id of pracIds) {
          availableHours += availableHoursFor(id, w.start, w.end, settings, openHours);
        }
        // Filled hours = the practitioner's booked diary time. A did-not-arrive
        // still held the slot, so it counts; cancelled slots were freed, so they
        // do NOT (this mirrors Cliniko's own reporting). Intervals are unioned
        // per practitioner so overlapping bookings count once. Cancelled and DNA
        // time are tracked separately for information.
        const filledByPrac = new Map<string, [number, number][]>();
        const cancelledByPrac = new Map<string, [number, number][]>();
        const dnaByPrac = new Map<string, [number, number][]>();
        for (const a of appointments) {
          const pid = idFromLink(a.practitioner?.links?.self);
          if (!pracIds.includes(pid)) continue;
          const s = new Date(a.starts_at);
          if (isBefore(s, w.start) || !isBefore(s, w.end)) continue;
          const iv: [number, number] = [s.getTime(), new Date(a.ends_at).getTime()];
          if (a.cancelled_at) {
            addInterval(cancelledByPrac, pid, iv);
            continue;
          }
          addInterval(filledByPrac, pid, iv); // attended + DNA
          if (a.did_not_arrive) {
            addInterval(dnaByPrac, pid, iv);
          } else if (isNewPatientAppt(a, typesById, settings.newPatientPatterns)) {
            newPatients += 1;
            if (hasFollowUp(a)) followUpsBooked += 1;
          }
        }
        const filledHours = sumUnionHours(filledByPrac);
        const cancelledHours = sumUnionHours(cancelledByPrac);
        const dnaHours = sumUnionHours(dnaByPrac);
        return { label: `Wk${i + 1}`, start: w.start, end: w.end, availableHours, filledHours, cancelledHours, dnaHours, newPatients, followUpsBooked, isFuture };
      });

      const sum = (f: (w: WeekMetrics) => number) => weeks.reduce((t, w) => t + f(w), 0);
      const monthIsFuture = isAfter(mStart, now);
      return {
        key: format(mStart, "yyyy-MM"),
        label: format(mStart, "MMM"),
        weeks,
        // Projection = full month; filled projection includes future bookings.
        projected: {
          availableHours: sum((w) => w.availableHours),
          filledHours: sum((w) => w.filledHours),
          cancelledHours: sum((w) => w.cancelledHours),
          dnaHours: sum((w) => w.dnaHours),
        },
        // Actual = realized to date: elapsed weeks only (future weeks excluded).
        actual: {
          availableHours: sum((w) => (w.isFuture ? 0 : w.availableHours)),
          filledHours: sum((w) => (w.isFuture ? 0 : w.filledHours)),
          cancelledHours: sum((w) => (w.isFuture ? 0 : w.cancelledHours)),
          dnaHours: sum((w) => (w.isFuture ? 0 : w.dnaHours)),
          newPatients: sum((w) => (w.isFuture ? 0 : w.newPatients)),
          followUpsBooked: sum((w) => (w.isFuture ? 0 : w.followUpsBooked)),
        },
        isFuture: monthIsFuture,
      };
    });

  return {
    months: buildMonths(included.map((p) => p.id)),
    perPractitioner: included.map((p) => ({ practitioner: p, months: buildMonths([p.id]) })),
  };
}

export const pct = (num: number, den: number): number | null => (den === 0 ? null : num / den);

export const fmtPct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export const fmtHours = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1));
