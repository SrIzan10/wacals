// why does this have to be so hard?
// props to gpt 5.4 for making it a tad more readable

const DAY_IN_MS = 1000 * 60 * 60 * 24;

function getStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getRelativeDayLabel(diffDays: number) {
  if (diffDays > 1) {
    return `en ${diffDays} días`;
  }

  if (diffDays === 1) {
    return "mañana";
  }

  if (diffDays === 0) {
    return "hoy";
  }

  return `hace ${Math.abs(diffDays)} días`;
}

export function styleDate(dateStr: string) {
  const eventDate = new Date(dateStr);
  const day = eventDate.getDate();
  const dayWeek = eventDate.toLocaleString("es-ES", { weekday: "long" });
  const month = eventDate.toLocaleString("es-ES", { month: "2-digit" });
  const time = eventDate.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const today = getStartOfDay(new Date());
  const eventDay = getStartOfDay(eventDate);
  const diffDays = Math.round((eventDay.getTime() - today.getTime()) / DAY_IN_MS);

  return `${dayWeek} ${day}/${month} · ${getRelativeDayLabel(diffDays)} · ${time}`;
}
