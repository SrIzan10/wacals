import type { CalendarEvent } from "../types";

export function getEventStartTime(event: CalendarEvent) {
  const value = event.start.dateTime ?? event.start.date;
  return value ? new Date(value).getTime() : 0;
}
