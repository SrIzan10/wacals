import type { ClassroomItem, ClassroomItemChange } from "../types";

export function getClassroomItemChanges(
  storedItem: ClassroomItem | null,
  incomingItem: ClassroomItem,
): ClassroomItemChange[] {
  if (!storedItem) {
    return ["created"] satisfies ClassroomItemChange[];
  }

  if (storedItem.updateTime === incomingItem.updateTime) {
    return [];
  }

  const changes: ClassroomItemChange[] = [];

  if (storedItem.title !== incomingItem.title) {
    changes.push("titleUpdate");
  }

  if (storedItem.dueDateTime !== incomingItem.dueDateTime) {
    changes.push("dueDateUpdate");
  }

  if (storedItem.state !== incomingItem.state) {
    changes.push("stateUpdate");
  }

  return changes;
}
