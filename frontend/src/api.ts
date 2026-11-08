// Клиент API. Все цифры считает бэкенд; фронт их только показывает.
// Локально запросы идут на /api (Vite проксирует на :8000), на Vercel — на адрес Render из VITE_API_URL.

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api'

export class ApiError extends Error {
  code: string
  status: number
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network', 'Сервер не отвечает. Бесплатный сервер просыпается до минуты — попробуйте еще раз.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? 'http', data?.message ?? `Ошибка сервера: ${res.status}`)
  }
  return data as T
}

export type Source = 'ai' | 'template'

export type Me = { id: string; name: string; initials: string; city: string; rating: number; deposit_pct: number }

export type NeedField = 'product' | 'qty_t' | 'due'

export type NeedResult = {
  spec: {
    product: string | null
    qty_t: number | null
    city: string
    city_from_profile: boolean
    hub: string
    due: string | null
    due_text: string | null
    due_source: 'given' | 'flexible' | 'missing' | 'past'
    budget_uzs: number | null
  }
  missing: NeedField[]
  question: string | null
  pool: { id: string; members: number; lot_t: number; lot_unit: string; joined: boolean } | null
  pool_late: { delivery_text: string } | null
  source: Source
}

/** Одно сообщение покупателя и вопрос, на который оно отвечает. */
export type NeedTurn = { text: string; asked: NeedField | null }

/** Биржа предлагает сама: прогноз по истории закупок и пул, который успевает к сроку. */
export type Offer = {
  product: string
  qty_t: number
  forecast: {
    purchases: number
    interval_days: number
    runout_text: string
    last_text: string
    days_left: number
  }
  pool: { id: string; members: number; price_uzs: number; discount_pct: number; delivery_text: string }
  draft: string
}

export type Factor = { key: string; label: string; points: number; deposit_pp: number }

export type Pool = {
  id: string
  title: string
  audience: string
  city: string
  deadline_text: string
  days_left: number
  lot_t: number
  lot_unit: string
  status: 'collecting' | 'filled'
  filled_t: number
  left_t: number
  members: number
  segments: { you: boolean; qty_t: number }[]
  qty_t: number
  price: {
    expected_uzs: number
    retail_uzs: number
    discount_pct: number
    order_uzs: number
    retail_order_uzs: number
    avg_exchange_uzs: number
    avg_month: string
    volume_discount_pct: [number, number]
    sellers_confirmed: number
  }
  trust: {
    rating: number
    deposit_pct: number
    deposit_uzs: number
    deposit_max_pct: number
    deposit_min_pct: number
    factors: Factor[]
    hint: { deals: number | null; target_pct: number }
  }
  you: { joined: boolean; deposit_uzs: number | null }
}

export type JoinResult = { pool: Pool; events: { name: string; qty_t: number }[] }

export type Seller = { id: string; name: string; short: string; rating: number; on_time_pct: number }

export type Auction = {
  sellers: Seller[]
  excluded: { id: string; name: string; rating: number }[]
  rounds: { round: number; bids: { seller_id: string; price: number | null }[]; best_price: number; leader_id: string }[]
  round_min: number
  final_price: number
  winner: Seller
  dropped_count: number
  below_retail_pct: number
  below_avg_pct: number
  explain: { points: string[]; source: Source }
  deal_id: string | null
}

export type Deal = {
  id: string
  pool_id: string
  product: string
  qty_kg: number
  price_uzs: number
  total_uzs: number
  deposit_uzs: number
  seller: { name: string; rating: number }
  hub: string
  delivery_text: string
  lot_t: number
  recipients: number
  stage: number
  status: 'active' | 'dispute' | 'arbiter' | 'settled'
  refund_uzs: number
  to_seller_uzs: number
  rating_change: { before: number; after: number; next_deposit_pct: number } | null
}

export type Dispute = {
  deal_id: string
  status: Deal['status']
  evidence: { waybill_kg: number; received_kg: number; photos: number; certificate_ok: boolean }
  checks: {
    recipients: number
    confirmed_others: number
    seller_short: string
    seller_linked: boolean
    seller_disputes_12m: number
  }
  decision: {
    shortfall_kg: number
    refund_uzs: number
    to_seller_uzs: number
    fault: 'hub' | 'seller'
    seller_rating_changes: boolean
  }
}

/** Голос в текст: звук уходит на бэкенд, ключ UzbekVoice живет только там. */
async function stt(audio: Blob): Promise<{ text: string }> {
  let res: Response
  try {
    res = await fetch(`${BASE}/stt`, { method: 'POST', headers: { 'Content-Type': audio.type || 'audio/webm' }, body: audio })
  } catch {
    throw new ApiError(0, 'network', 'Сервер не отвечает. Попробуйте еще раз или напишите текстом.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'http', data?.message ?? `Ошибка сервера: ${res.status}`)
  return data
}

export const api = {
  stt,
  me: () => call<Me>('GET', '/me'),
  reset: () => call<{ ok: true }>('POST', '/demo/reset'),
  offer: () => call<Offer | null>('GET', '/offer'),
  need: (turns: NeedTurn[]) =>
    call<NeedResult>('POST', '/need', { messages: turns.map((t) => t.text), asked: turns.map((t) => t.asked) }),
  pool: (id: string, qty_t: number) => call<Pool>('GET', `/pools/${id}?qty_t=${qty_t}`),
  join: (id: string, qty_t: number) => call<JoinResult>('POST', `/pools/${id}/join`, { qty_t }),
  auction: (id: string) => call<Auction>('GET', `/pools/${id}/auction`),
  deal: (id: string) => call<Deal>('GET', `/deals/${id}`),
  pay: (id: string) => call<Deal>('POST', `/deals/${id}/pay`),
  confirm: (id: string) => call<Deal>('POST', `/deals/${id}/confirm`),
  openDispute: (id: string) => call<Deal>('POST', `/deals/${id}/dispute`),
  dispute: (id: string) => call<Dispute>('GET', `/deals/${id}/dispute`),
  accept: (id: string) => call<{ deal: Deal; dispute: Dispute }>('POST', `/deals/${id}/dispute/accept`),
  escalate: (id: string) => call<{ deal: Deal; dispute: Dispute }>('POST', `/deals/${id}/dispute/escalate`),
}
