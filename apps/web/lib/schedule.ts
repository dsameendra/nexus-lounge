const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const pad = (value: number) => String(value).padStart(2, "0");

// `datetime-local` values are wall-clock time in this browser's zone; the room stores UTC epoch milliseconds.
export function toLocalInput(epoch: number) {
  const date = new Date(epoch);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hours, minutes] = match.map(Number) as [number, number, number, number, number, number];
  const epoch = new Date(year, month - 1, day, hours, minutes).getTime();
  return Number.isFinite(epoch) ? epoch : null;
}

export function upcoming(startsAt: number | null | undefined, now = Date.now()): startsAt is number {
  return typeof startsAt === "number" && startsAt > now;
}

export function startsIn(startsAt: number, now = Date.now()) {
  const left = startsAt - now;
  if (left < MINUTE) return "Starts in under a minute";
  if (left < HOUR) {
    const minutes = Math.round(left / MINUTE);
    return `Starts in ${minutes} min`;
  }
  if (left < DAY) {
    const hours = Math.round(left / HOUR);
    return `Starts in ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.round(left / DAY);
  return `Starts in ${days} day${days === 1 ? "" : "s"}`;
}

export function exactTime(startsAt: number, locale?: string) {
  return new Date(startsAt).toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// Discord renders <t:…> in each reader's own time zone; plain text elsewhere shows the codes.
export function inviteText(link: string, startsAt: number | null | undefined, now = Date.now()) {
  if (!upcoming(startsAt, now)) return link;
  const seconds = Math.floor(startsAt / 1000);
  return `${link}\nStarts <t:${seconds}:F> (<t:${seconds}:R>)`;
}
