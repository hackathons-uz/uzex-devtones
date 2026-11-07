import { useState } from 'react'
import { api, type Preview } from '../api'
import { AiCard, Button, ErrorBox, Icon, Reveal, Scale, Segmented, SourceLabel, Trust, useLoad } from '../components/ui'
import { deals, mln, pct, sum, t } from '../format'

const BUYER = 'stroyplus'
const TRUSTED = 'ferganass'
const QTY: Record<string, number[]> = { 'lot-sugar': [2, 5], 'lot-cement': [5, 10, 20] }

export function DepositScreen({ go }: { go: (s: string) => void }) {
  const [lotId, setLotId] = useState<'lot-sugar' | 'lot-cement'>('lot-sugar')
  const [qty, setQty] = useState(2)
  const [guarantor, setGuarantor] = useState<string | null>(null)
  const [mode, setMode] = useState<'deposit' | 'insurance'>('deposit')
  const [stage, setStage] = useState<{ id: string; status: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<unknown>(null)

  const q = useLoad(
    () => api.preview({ buyer_id: BUYER, lot_id: lotId, qty_t: qty, guarantor_id: guarantor, payment_mode: mode }),
    [lotId, qty, guarantor, mode],
  )
  const trusted = useLoad(() => api.preview({ buyer_id: TRUSTED, lot_id: 'lot-cement', qty_t: 40 }), [])

  const pickLot = (id: 'lot-sugar' | 'lot-cement') => {
    setLotId(id)
    setQty(id === 'lot-sugar' ? 2 : 20)
    setGuarantor(null)
    setMode('deposit')
    setStage(null)
  }

  const submit = async () => {
    setBusy(true)
    setActionError(null)
    try {
      const r = await api.submit({ buyer_id: BUYER, lot_id: lotId, qty_t: qty, guarantor_id: guarantor, payment_mode: mode })
      setStage({ id: r.id, status: r.status })
    } catch (e) {
      setActionError(e)
    } finally {
      setBusy(false)
    }
  }
  const lock = async () => {
    if (!stage) return
    setBusy(true)
    try {
      setStage(await api.confirmRequest(stage.id))
    } catch (e) {
      setActionError(e)
    } finally {
      setBusy(false)
    }
  }

  const p = q.data
  return (
    <section className="screen" aria-labelledby="h">
      <div className="col-main">
        <h1 className="h1" id="h">
          Заявка без брокера
        </h1>
        <p className="lead">Залог зависит от вашего рейтинга доверия. Чем честнее торгуете, тем меньше денег нужно, чтобы войти.</p>

        <div className="block">
          <span className="label">Лот</span>
          <Segmented
            label="Лот"
            value={lotId}
            onChange={pickLot}
            options={[
              { value: 'lot-sugar', label: 'Сахар белый · от рейтинга 70' },
              { value: 'lot-cement', label: 'Цемент М400 · от рейтинга 40' },
            ]}
          />
        </div>
        <div className="block">
          <span className="label">Сколько тонн</span>
          <Segmented label="Сколько тонн" value={qty} onChange={(v) => (setQty(v), setStage(null))} options={QTY[lotId].map((v) => ({ value: v, label: t(v) }))} />
        </div>
        {p && (
          <div className="block">
            <span className="label">Кто ручается и как платите</span>
            <div className="flex flex-wrap gap-3">
              <Segmented
                label="Поручитель"
                value={guarantor ?? ''}
                onChange={(v) => (setGuarantor(v || null), setStage(null))}
                options={[
                  { value: '', label: 'Без поручителя' },
                  { value: 'nadezhny', label: 'Ручается Надежный Строй' },
                ]}
              />
              <Segmented
                label="Способ"
                value={mode}
                onChange={(v) => (setMode(v), setStage(null))}
                options={[
                  { value: 'deposit', label: 'Залог' },
                  { value: 'insurance', label: 'Страховка', disabled: !p.insurance_option.available && mode !== 'insurance' },
                ]}
              />
            </div>
            {!p.insurance_option.available && <p className="hint">Страховка вместо залога доступна с рейтинга 60.</p>}
          </div>
        )}

        <ErrorBox error={q.error} />
        {p && <Verdict p={p} onOption={(code, maxT) => {
          if (code === 'guarantor') setGuarantor('nadezhny')
          if (code === 'smaller_volume' && maxT) setQty(QTY[lotId].filter((v) => v <= maxT).at(-1) ?? QTY[lotId][0])
          if (code === 'pool') go('pool')
          if (code === 'improve_rating') pickLot('lot-cement')
        }} />}
      </div>

      <div className="col-side">
        {p && <MoneyIsland p={p} />}
        {trusted.data && (
          <div className="card">
            <h2 className="h2">Для сравнения</h2>
            <div className="row" style={{ borderTop: 0 }}>
              <span className="row__name">
                {trusted.data.buyer.name}
                <span className="row__meta">
                  Дочерняя компания «Надежный Строй», цемент {t(trusted.data.qty_t)} на {mln(trusted.data.amount_uzs)}
                </span>
              </span>
              <span className="row__t num">{pct(trusted.data.deposit.pct)}</span>
              <Trust r={trusted.data.buyer.rating} />
            </div>
            <p className="hint">
              Залог {sum(trusted.data.deposit.deposit_uzs)}. Сегодня на бирже задаток около 10% для всех и вход только через брокера.
            </p>
          </div>
        )}
      </div>

      <div className="actions col-act">
        {p && p.admission.admitted && !p.existing_request && !stage && (
          <Button icon busy={busy} onClick={submit}>
            Подать заявку · залог {mln(p.deposit.deposit_uzs)}
          </Button>
        )}
        {p && p.existing_request && !stage && (
          <>
            <span className="state">Заявка уже подана: {t(p.existing_request.qty_t)}, ждет пула</span>
            <Button icon onClick={() => go('pool')}>
              Посмотреть пул
            </Button>
          </>
        )}
        {stage?.status === 'admitted' && (
          <Button icon busy={busy} onClick={lock}>
            Подтвердить и заблокировать залог
          </Button>
        )}
        {stage?.status === 'deposit_locked' && (
          <span className="state state--ok">
            {Icon.check} Залог заблокирован на гарантийном счете
          </span>
        )}
        <ErrorBox error={actionError} />
      </div>
    </section>
  )
}

function Verdict({ p, onOption }: { p: Preview; onOption: (code: string, maxT?: number) => void }) {
  const ok = p.admission.admitted
  return (
    <AiCard tag={p.explanation.source === 'ai' ? 'ИИ объясняет' : 'Объяснение'} className="block">
      <div className={`verdict ${ok ? '' : 'verdict--no'}`}>
        <span className="verdict__icon">{ok ? Icon.check : Icon.cross}</span>
        <p className="verdict__title">{ok ? 'Вы подходите под правила продавца' : 'Вы не подходите, потому что…'}</p>
      </div>
      <ul className="checks">
        {p.lot.rule_lines.map((line) => {
          const bad = p.admission.reasons.some((r) => matches(r.code, line))
          return (
            <li key={line} className={bad ? 'bad' : 'ok'}>
              {bad ? Icon.cross : Icon.check}
              {line}
            </li>
          )
        })}
      </ul>
      <p className="ai-text" key={p.explanation.text}>
        <Reveal text={p.explanation.text} />
      </p>
      {!ok && p.admission.options.length > 0 && (
        <div className="quick">
          {p.admission.options.map((o) => (
            <button key={o.code + o.message} type="button" className="chip" onClick={() => onOption(o.code, o.max_t)}>
              {o.message}
            </button>
          ))}
        </div>
      )}
      <SourceLabel e={p.explanation} />
    </AiCard>
  )
}

function matches(code: string, line: string) {
  if (code === 'rule_min_rating') return line.startsWith('Рейтинг')
  if (code === 'rule_newbie_volume') return line.startsWith('Новичкам')
  if (code === 'rule_guarantor_required') return line.startsWith('Поручитель')
  return false
}

function MoneyIsland({ p }: { p: Preview }) {
  const d = p.deposit
  return (
    <div className="card card--island" aria-live="polite">
      <div className="sum">
        <div className="sum__row">
          <span>
            {p.lot.title}, {t(p.qty_t)} по {sum(p.lot.price_per_t)}
          </span>
          <b>{sum(p.amount_uzs)}</b>
        </div>
        <div className="sum__row">
          <span>Продавец</span>
          <b>
            {p.seller.name} · {p.seller.rating}
          </b>
        </div>
        <div className="sum__total">
          <span className="muted">Ваш рейтинг</span>
          <b>{p.buyer.rating}</b>
        </div>
      </div>
      <div className="deposit">
        <div className="deposit__head">
          <span className="muted">{d.insurance ? 'Залог при страховке' : 'Залог сейчас'}</span>
          <span className="deposit__amt">{sum(d.deposit_uzs)}</span>
        </div>
        <div className="deposit__pct" style={{ marginTop: 6 }}>
          {pct(d.pct)}
        </div>
        <Scale pct={d.pct} />
        {d.insurance && (
          <p>
            Вместо залога невозвратный взнос в общий фонд: <b>{pct(d.fee_pct ?? 0)}</b>, это <b>{sum(d.fee_uzs)}</b>.
          </p>
        )}
        <p>
          У вас <b>{deals(p.buyer.completed_deals)}</b>
          {p.buyer.is_newbie ? ', вы новичок' : ''}.{' '}
          {p.next_tier ? (
            <>
              До залога <b>{pct(p.next_tier.pct)}</b> осталось <b>{p.next_tier.points_left}</b> баллов рейтинга.
            </>
          ) : (
            'У вас лучший уровень залога.'
          )}
        </p>
        <p>
          После следующей честной сделки рейтинг станет <b>{p.after_next_deal.rating}</b>, залог на такую же заявку —{' '}
          <b>{pct(p.after_next_deal.deposit_pct)}</b>.
        </p>
      </div>
    </div>
  )
}
