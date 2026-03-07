import type { CalendarEvent } from "../types";
import { styleDate } from "./styleDate";

export function formatEventDate(event: CalendarEvent | null, key: "start" | "end") {
  const value = event?.[key].dateTime ?? event?.[key].date;
  return value ? styleDate(value) : "fecha desconocida";
}
