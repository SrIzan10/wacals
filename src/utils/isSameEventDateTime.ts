import type { CalendarEvent } from "../types";

export function isSameEventDateTime(
	left: CalendarEvent["start"] | CalendarEvent["end"],
	right: CalendarEvent["start"] | CalendarEvent["end"],
) {
	return (
		left.dateTime === right.dateTime
		&& left.date === right.date
		&& left.timeZone === right.timeZone
	);
}