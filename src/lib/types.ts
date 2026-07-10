export interface Practitioner {
  id: string;
  first_name: string;
  last_name: string;
  active: boolean;
  designation?: string;
}

export interface Appointment {
  id: string;
  starts_at: string; // ISO
  ends_at: string; // ISO
  cancelled_at: string | null;
  did_not_arrive: boolean;
  practitioner: { links: { self: string } };
  patient: { links: { self: string } } | null;
  appointment_type: { links: { self: string } };
}

export interface AppointmentType {
  id: string;
  name: string;
  duration_in_minutes: number;
}

export interface UnavailableBlock {
  id: string;
  starts_at: string;
  ends_at: string;
  practitioner: { links: { self: string } };
}

/**
 * Per-practitioner "hours open" set on their Cliniko profile (not calendarised).
 * One record per working weekday, each with one or more open windows.
 */
export interface DailyAvailability {
  id: string;
  day_of_week: number; // 1 = Monday … 7 = Sunday
  availabilities: { starts_at: string; ends_at: string }[]; // "HH:MM" clinic-local
  practitioner: { links: { self: string } };
}

/** Roster: hours available per weekday (0=Mon ... 6=Sun) per practitioner. */
export type WeekRoster = [number, number, number, number, number, number, number];

export interface PractitionerSettings {
  roster: WeekRoster;
  /** Individual capacity target, e.g. 0.85. */
  capacityTarget: number;
  include: boolean;
}

export interface Settings {
  /** Business-level targets */
  capacityTarget: number; // e.g. 0.85
  conversionTarget: number; // e.g. 0.85
  /** Appointment-type name patterns (case-insensitive substrings) counted as new patients */
  newPatientPatterns: string[];
  practitioners: Record<string, PractitionerSettings>;
}

export interface WeekMetrics {
  label: string; // "Wk1"
  start: Date;
  end: Date;
  availableHours: number;
  filledHours: number; // all booked slots, incl. cancelled & DNA (union per practitioner)
  cancelledHours: number; // subset of filled that was cancelled (informational)
  dnaHours: number; // subset of filled the patient did not arrive for (informational)
  newPatients: number;
  followUpsBooked: number;
  isFuture: boolean;
}

export interface MonthMetrics {
  key: string; // "2026-04"
  label: string; // "Apr"
  weeks: WeekMetrics[];
  projected: { availableHours: number; filledHours: number; cancelledHours: number; dnaHours: number };
  actual: {
    availableHours: number;
    filledHours: number;
    cancelledHours: number;
    dnaHours: number;
    newPatients: number;
    followUpsBooked: number;
  };
  isFuture: boolean;
}

export interface PractitionerMetrics {
  practitioner: Practitioner;
  months: MonthMetrics[];
}

export interface DashboardData {
  months: MonthMetrics[]; // clinic totals
  perPractitioner: PractitionerMetrics[];
}
