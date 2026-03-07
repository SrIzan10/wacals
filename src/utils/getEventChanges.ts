import type { CalendarEvent, EventChange } from "../types";
import { isSameEventDateTime } from "./isSameEventDateTime";

export function getEventChanges(
	storedEvent: CalendarEvent | null,
	incomingEvent: CalendarEvent,
): EventChange[] {
	if (!storedEvent) {
		return ["created"] satisfies EventChange[];
	}

	if (storedEvent.updated === incomingEvent.updated) {
		return [];
	}

	const changes: EventChange[] = [];

	if (storedEvent.summary !== incomingEvent.summary) {
		changes.push("summaryUpdate");
	}

	if (!isSameEventDateTime(storedEvent.start, incomingEvent.start)) {
		changes.push("startUpdate");
	}

	if (!isSameEventDateTime(storedEvent.end, incomingEvent.end)) {
		changes.push("endUpdate");
	}

	return changes;
}