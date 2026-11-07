// Клиент API. Все цифры считает бэкенд; фронт их только показывает.

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
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? 'http', data?.message ?? `Ошибка сервера: ${res.status}`)
  }
  return data as T
}

export type Source = 'ai' | 'template' | 'formula'
export type Explanation = { text: string; source: Source; kind?: string }

export type Participant = {
  id: string
  name: string
  role: string
  region: string
  rating: number
  completed_deals: number
  is_newbie: boolean
  defaults_12m: number
  note: string | null
  components: {
    S: number
    P: number
    D: number
    T: number
    V: number
    n: number
    raw: number
    history_weight: number
    start: number
    penalties: number
  }
  deposit_pct?: number
  next_tier?: NextTier | null
  rating_after_next_deal?: number
}

export type Rule = {
  min_rating: number | null
  min_prepay_pct: number | null
  newbie_max_volume_t: number | null
  allow_pool: boolean | null
  require_guarantor_below_rating: number | null
}

export type Lot = {
  id: string
  title: string
  product: string
  grade: string
  volume_t: number
  price_per_t: number
  amount_uzs: number
  region: string
  deadline: string
  pool_allowed: boolean
  rule: Rule
  rule_lines: string[]
  rules_text: string | null
  seller: { id: string; name: string; region: string; rating: number; completed_deals: number; defaults_12m: number }
  delivery_estimate?: {
    to_region: string
    qty_t: number
    km: number
    per_t_uzs: number
    real_price_per_t: number
    is_estimate: boolean
  }
}

export type Reason = { code: string; message: string }
export type Option = { code: string; message: string; max_t?: number; points?: number }
export type Admission = {
  admitted: boolean
  status: 'admitted' | 'rejected'
  effective_rating: number
  is_newbie: boolean
  reasons: Reason[]
  options: Option[]
  locked?: boolean
  new_rule_would_reject?: boolean
}
export type NextTier = { rating: number; pct: number; points_left: number }
export type Deposit = { pct: number; deposit_uzs: number; insurance: boolean; fee_pct: number | null; fee_uzs: number }

export type Preview = {
  buyer: Pick<Participant, 'id' | 'name' | 'region' | 'rating' | 'completed_deals' | 'is_newbie'>
  lot: Pick<Lot, 'id' | 'title' | 'price_per_t' | 'volume_t' | 'rule_lines' | 'rules_text' | 'pool_allowed'>
  seller: Lot['seller']
  qty_t: number
  amount_uzs: number
  guarantor_rating: number | null
  payment_mode: 'deposit' | 'insurance'
  admission: Admission
  deposit: Deposit
  escrow_rest_uzs: number
  next_tier: NextTier | null
  after_next_deal: { rating: number; deposit_pct: number; deposit_uzs: number }
  insurance_option: { available: boolean; fee_pct: number | null; fee_uzs: number | null }
  existing_request: { id: string; qty_t: number; status: string } | null
  explanation: Explanation
}

export type RequestBody = {
  buyer_id: string
  lot_id: string
  qty_t: number
  guarantor_id?: string | null
  payment_mode?: 'deposit' | 'insurance'
}

export type PoolMember = {
  request_id: string
  buyer_id: string
  buyer_name: string
  buyer_rating: number
  region: string
  share_t: number
  goods_uzs: number
  deposit_pct: number
  deposit_uzs: number
  alone_trips: number
  alone_km: number
  alone_uzs: number
  pool_share_uzs: number
  saving_uzs: number
  confirmed: boolean
}
export type Excluded = { request_id: string; buyer_name: string; qty_t: number; region: string; code: string; message: string }
export type Pool = {
  id: string
  status: 'proposed' | 'confirming' | 'locked' | 'closed' | 'failed'
  lot_id: string
  lot_title: string
  total_t: number
  volume_t: number
  fill_pct: number
  min_fill_t: number
  price_per_t: number
  members: PoolMember[]
  route: { request_id: string; buyer_name: string; region: string; km: number }[]
  route_km: number
  trips: number
  pool_cost_uzs: number
  alone_cost_uzs: number
  saving_uzs: number
  seller: Lot['seller']
  seller_region: string
  excluded: Excluded[]
  confirmed_count: number
  explanation: Explanation
  replaced_pool_id?: string
  replan?: { message: string; max_collected_t: number; min_fill_t: number }
}

export type Risk = {
  score: number
  level: 'low' | 'medium' | 'high'
  signals: { code: string; points: number; message: string }[]
  explanation: Explanation
}
export type SellerRequest = {
  id: string
  buyer: Pick<Participant, 'id' | 'name' | 'region' | 'rating' | 'completed_deals' | 'is_newbie' | 'defaults_12m'>
  qty_t: number
  amount_uzs: number
  bid_price_per_t: number
  status: string
  admission: Admission
  deposit: { pct: number; deposit_uzs: number }
  risk: Risk
}
export type ParsedRule = {
  text: string
  rule: Rule | null
  rule_lines: string[]
  unparsed: string[]
  source: Source
  manual: boolean
}
export type Decision = {
  id: number
  entity_type: string
  entity_id: string
  kind: string
  explanation: string | null
  source: Source
  created_at: string
  output: unknown
  title: string
  summary: string
}
export type Fund = {
  fee_pct: number
  default_rate_pct: number
  max_loss_pct: number
  expected_loss_pct: number
  sustainable: boolean
  fee_tiers: { min_rating: number; pct: number; max_default_rate_pct: number }[]
  min_rating: number
  max_amount_uzs: number
}

export const api = {
  participant: (id: string) => call<Participant>('GET', `/participants/${id}`),
  lots: (buyerId?: string, qtyT?: number) =>
    call<Lot[]>('GET', `/lots${buyerId ? `?buyer_id=${buyerId}${qtyT ? `&qty_t=${qtyT}` : ''}` : ''}`),
  lot: (id: string) => call<Lot>('GET', `/lots/${id}`),
  preview: (b: RequestBody) => call<Preview>('POST', '/requests/preview', b),
  submit: (b: RequestBody) => call<Preview & { id: string; status: string }>('POST', '/requests', b),
  confirmRequest: (id: string) => call<{ id: string; status: string }>('POST', `/requests/${id}/confirm`),
  poolProposals: (lotId: string) =>
    call<{
      pools: Pool[]
      reason: string | null
      excluded?: Excluded[]
      details?: { max_collected_t?: number; min_fill_t?: number }
    }>('GET', `/lots/${lotId}/pool-proposals`),
  poolConfirm: (poolId: string, pid: string) => call<Pool>('POST', `/pools/${poolId}/confirm?participant_id=${pid}`),
  poolWithdraw: (poolId: string, pid: string) => call<Pool>('POST', `/pools/${poolId}/withdraw?participant_id=${pid}`),
  parseRule: (lotId: string, text: string) => call<ParsedRule>('POST', `/lots/${lotId}/rules/parse`, { text }),
  saveRule: (lotId: string, rule: Rule, text: string, source: Source) =>
    call<Lot>('POST', `/lots/${lotId}/rules`, { rule, text, source: source === 'ai' ? 'ai' : 'template' }),
  sellerRequests: (lotId: string) => call<{ lot: Lot; requests: SellerRequest[] }>('GET', `/lots/${lotId}/requests`),
  decisions: () => call<Decision[]>('GET', '/decisions?limit=60'),
  fund: () => call<Fund>('GET', '/fund'),
  reset: () => call<{ ok: boolean }>('POST', '/demo/reset'),
}
