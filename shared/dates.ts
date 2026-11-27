/**
 * Datas "de calendário" (YYYY-MM-DD), sem hora e sem fuso.
 * Toda conta de vencimento, prazo e fatura usa este formato, para que
 * "vence dia 26" seja dia 26 no Brasil, não no UTC do servidor.
 */

export type ISODate = string;

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function makeDate(year: number, month1: number, day: number): ISODate {
  return `${year}-${pad(month1)}-${pad(day)}`;
}

export function parts(d: ISODate): { y: number; m: number; d: number } {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, d: day };
}

export function lastDayOfMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Dia X do mês, ajustado para o último dia quando o mês é mais curto (31 → 30/28). */
export function clampedDate(year: number, month1: number, day: number): ISODate {
  // normaliza mês fora de 1..12
  const total = year * 12 + (month1 - 1);
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return makeDate(y, m, Math.min(day, lastDayOfMonth(y, m)));
}

function toUTC(d: ISODate): number {
  const { y, m, d: day } = parts(d);
  return Date.UTC(y, m - 1, day);
}

export function addDays(d: ISODate, n: number): ISODate {
  const t = new Date(toUTC(d) + n * 86_400_000);
  return makeDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function addMonths(d: ISODate, n: number, keepDay?: number): ISODate {
  const { y, m, d: day } = parts(d);
  return clampedDate(y, m + n, keepDay ?? day);
}

export function addYears(d: ISODate, n: number): ISODate {
  const { y, m, d: day } = parts(d);
  return clampedDate(y + n, m, day);
}

/** Dias de `a` até `b` (b − a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

/** Hoje no fuso informado (ex.: America/Sao_Paulo). */
export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return f.format(now);
}

/** Hora atual HH:MM no fuso informado. */
export function timeIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

/** A regra "todo dia X" acontece nesta data? (dia 31 cai no último dia em meses curtos) */
export function monthlyRuleOccursOn(dayOfMonth: number, date: ISODate): boolean {
  const { y, m, d } = parts(date);
  return d === Math.min(dayOfMonth, lastDayOfMonth(y, m));
}

/** Próxima ocorrência da regra "todo dia X" a partir de `from` (inclusive). */
export function nextMonthlyOccurrence(dayOfMonth: number, from: ISODate): ISODate {
  const { y, m } = parts(from);
  const thisMonth = clampedDate(y, m, dayOfMonth);
  return thisMonth >= from ? thisMonth : clampedDate(y, m + 1, dayOfMonth);
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

export function monthRange(key: string): { start: ISODate; end: ISODate } {
  const [y, m] = key.split("-").map(Number);
  return { start: makeDate(y, m, 1), end: makeDate(y, m, lastDayOfMonth(y, m)) };
}
