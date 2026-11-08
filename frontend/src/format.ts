// Форматирование для показа. Ничего не считает: только пробелы между разрядами и запятые.

export const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/[  ,]/g, ' ')

export const fmtDec = (n: number) => String(n).replace('.', ',')

export const pct = (n: number) => `${fmtDec(n)}%`

/** −3% / −2,5% / +0,5%: знак всегда, как в новом макете. */
export const pp = (n: number) => `${n > 0 ? '+' : '−'}${fmtDec(Math.abs(n))}%`

export function plural(n: number, one: string, few: string, many: string) {
  const m = Math.abs(n) % 100
  if (m >= 11 && m <= 14) return many
  if (m % 10 === 1) return one
  if (m % 10 >= 2 && m % 10 <= 4) return few
  return many
}

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, reduceMotion() ? 0 : ms))
