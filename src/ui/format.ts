export function fmtHM(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} m` : `${m} m`;
}

/** Horas con un decimal y coma decimal: "12,4 h". */
export function fmtHours1(seconds: number): string {
  return `${(seconds / 3600).toFixed(1).replace('.', ',')} h`;
}

/** "YYYY-MM-DD" → "DD/MM". */
export function fmtShortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}
