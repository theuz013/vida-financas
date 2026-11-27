import { daysBetween, type ISODate } from "@shared/dates";
export { formatBRL, parseBRL } from "@shared/money";

const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthsLong = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const weekdays = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function localToday(): ISODate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** "26 nov" */
export function shortDate(d: ISODate) {
  const [, m, day] = d.split("-").map(Number);
  return `${day} ${months[m - 1]}`;
}

/** "sexta, 27 de novembro" */
export function longDate(d: ISODate) {
  const [y, m, day] = d.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return `${weekdays[wd]}, ${day} de ${monthsLong[m - 1]}`;
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${monthsLong[m - 1]} ${y}`;
}

/** "hoje", "amanhã", "ontem", "em 5 dias", "há 3 dias" */
export function relativeDay(d: ISODate, today = localToday()) {
  const n = daysBetween(today, d);
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n === -1) return "ontem";
  return n > 0 ? `em ${n} dias` : `há ${-n} dias`;
}

/** Centavos → texto para campo de edição ("67,54"). */
export function centsToInput(c: number | null | undefined) {
  if (c == null) return "";
  return (c / 100).toFixed(2).replace(".", ",");
}

export function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(now));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
