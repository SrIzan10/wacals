import type { ClassroomItem } from "../types";

export function getClassroomItemTime(item: ClassroomItem) {
  const value = item.dueDateTime ?? item.creationTime;
  return value ? new Date(value).getTime() : 0;
}
