/** Dinheiro em centavos (inteiro). */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/**
 * Aceita "67,54", "67.54", "1.234,56", "R$ 1.234,56", "1234" e devolve centavos.
 * Retorna null quando não dá para entender o valor.
 */
export function parseBRL(input: string | number): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }
  let s = input.replace(/R\$|\s/g, "").trim();
  if (!s) return null;
  const negative = s.startsWith("-");
  s = s.replace(/^-/, "");
  if (s.includes(",")) {
    // formato brasileiro: ponto é milhar, vírgula é decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(s)) {
    // "1.234" ou "1.234.567" = milhar
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return negative ? -cents : cents;
}

/** Divide um valor em n parcelas; os centavos que sobram vão para a primeira. */
export function splitInstallments(total: number, n: number): number[] {
  const count = Math.max(1, Math.floor(n));
  const base = Math.floor(total / count);
  const rest = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i === 0 ? rest : 0));
}
