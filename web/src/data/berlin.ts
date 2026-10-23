// Europe/Berlin ↔ UTC by the EU rule: summer time (UTC+2) from the last Sunday of March 01:00 UTC
// to the last Sunday of October 01:00 UTC, otherwise UTC+1.
const HOUR = 3_600_000

const lastSundayUtc = (year: number, month: number) => {
  const last = new Date(Date.UTC(year, month + 1, 0))
  return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1)
}

export function isSummerTime(utcMs: number): boolean {
  const year = new Date(utcMs).getUTCFullYear()
  return utcMs >= lastSundayUtc(year, 2) && utcMs < lastSundayUtc(year, 9)
}

/** Both UTC instants a Berlin wall-clock time (given as if it were UTC) can mean: 0, 1 or 2 of them. */
export function berlinCandidates(localMs: number): number[] {
  const summer = localMs - 2 * HOUR
  const winter = localMs - HOUR
  return [...(isSummerTime(summer) ? [summer] : []), ...(isSummerTime(winter) ? [] : [winter])]
}
