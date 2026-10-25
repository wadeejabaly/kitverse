/** Israel wall-clock helpers (Asia/Jerusalem: +2 in winter, +3 in summer). */
const TZ = "Asia/Jerusalem";

/** Israel's UTC offset in ms at a moment. */
function offsetAt(t: number): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}

/** The instant an Israel calendar day (YYYY-MM-DD) starts, correct on clock-change days too. */
function israelMidnight(day: string): Date {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  const first = utcMidnight - offsetAt(utcMidnight);
  return new Date(utcMidnight - offsetAt(first));
}

const israelDay = (now: Date) => now.toLocaleDateString("en-CA", { timeZone: TZ });

/** Start of today in Israel, as an ISO timestamp. */
export const israelDayStart = (now = new Date()) => israelMidnight(israelDay(now)).toISOString();

/** Last millisecond of today in Israel, as an ISO timestamp. */
export function israelDayEnd(now = new Date()): string {
  const next = new Date(israelMidnight(israelDay(now)).getTime() + 26 * 3600_000); // safely inside tomorrow
  return new Date(israelMidnight(israelDay(next)).getTime() - 1).toISOString();
}
