export function truncate(value: string | undefined, maxLength: number) {
  if (!value) {
    return undefined;
  }

  return value.length > maxLength
    ? `${value.slice(0, maxLength).trimEnd()}…`
    : value;
}
