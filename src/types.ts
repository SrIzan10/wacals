export interface CalendarEvent {
  kind: "calendar#event";
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  summary?: string; // TOTRACK
  description?: string;

  created: string;   // ISO datetime
  updated: string;   // ISO datetime // TOTRACK

  eventType: "default" | string;
  iCalUID: string;
  etag: string;

  htmlLink?: string;

  sequence?: number;
  transparency?: "opaque" | "transparent";

  start: EventDateTime; // TOTRACK
  end: EventDateTime; // TOTRACK

  organizer?: Organizer;
  creator?: Creator;

  reminders?: Reminders;
}

export interface EventDateTime {
  dateTime?: string; // ISO datetime
  date?: string;     // all-day events
  timeZone?: string;
}

export interface Organizer {
  email: string;
  displayName?: string;
  self?: boolean;
}

export interface Creator {
  email: string;
}

export interface Reminders {
  useDefault: boolean;
}

export type EventChange = "created" | "summaryUpdate" | "startUpdate" | "endUpdate";
