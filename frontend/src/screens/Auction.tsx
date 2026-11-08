import { useEffect, useRef, useState } from 'react'
import { api, type Auction as AuctionT, type Seller } from '../api'
import { fmt, fmtDec, plural, sleep } from '../format'
import { ActionBar, Arrow, Dr, ErrorNote, Roll } from '../components/ui'
import { SELLER_LOGOS } from '../components/sellerLogos'

const COUNTDOWN_S = 5
const ROUND_MS = 1400

type Phase = 'wait' | 'run' | 'done'

function Logo({ id, name, lg }: { id: string; name: string; lg?: boolean }) {
  const svg = SELLER_LOGOS[id]
  if (svg) return <span className={`lg${lg ? ' lg-lg' : ''}`} dangerouslySetInnerHTML={{ __html: svg }} />
  const letter = name.replace(/^[^«]*«/, '').charAt(0)
  return (
    <span className={`lg${lg ? ' lg-lg' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <rect width="48" height="48" fill="var(--burgundy)" />
        <text x="24" y="31" textAnchor="middle" fontWeight="800" fontSize="20" fill="var(--on-burgundy)">
          {letter}
        </text>
      </svg>
    </span>
  )
}

/**
 * Шаг 3: торги. Ставки и победителя считает бэкенд; экран проигрывает раунды ускоренно:
 * в демо 30 минут торгов занимают несколько секунд. После конца первым идет итог, как в макете.
 */
export function Auction({
  poolId,
  qty,
  data,
  played,
  onData,
  onPlayed,
  onToDeal,
}: {
  poolId: string
  qty: number
  data: AuctionT | null
  played: boolean
  onData: (a: AuctionT) => void
  onPlayed: () => void
  onToDeal: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<Phase>(played ? 'done' : 'wait')
  const [count, setCount] = useState(COUNTDOWN_S)
  const [round, setRound] = useState(played && data ? data.rounds.length : 0)
  const started = useRef(false)

  useEffect(() => {
    if (data) return
    setError(null)
    api
      .auction(poolId)
      .then(onData)
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId, attempt])

  useEffect(() => {
    if (!data || played || started.current) return
    started.current = true
    ;(async () => {
      for (let c = COUNTDOWN_S; c > 0; c--) {
        setCount(c)
        await sleep(1000)
      }
      setPhase('run')
      for (let r = 1; r <= data.rounds.length; r++) {
        setRound(r)
        await sleep(ROUND_MS)
      }
      setPhase('done')
      onPlayed()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  if (!data) {
    return (
      <section className="scr">
        {error ? <ErrorNote error={error} onRetry={() => setAttempt((a) => a + 1)} /> : <p className="loading">Загружаю торги…</p>}
      </section>
    )
  }

  const total = data.rounds.length
  const totalMin = total * data.round_min
  const cur = round > 0 ? data.rounds[round - 1] : null
  const all = data.rounds.flatMap((r) => r.bids.map((b) => b.price).filter((p): p is number => p !== null))
  const MIN = Math.floor((Math.min(...all) * 0.94) / 100) * 100
  const MAX = Math.ceil((Math.max(...all) * 1.02) / 100) * 100
  const width = (p: number) => ((p - MIN) / (MAX - MIN)) * 100
  const lastBid = (i: number, upto: number) =>
    data.rounds
      .slice(0, upto)
      .map((r) => r.bids[i].price)
      .filter((p): p is number => p !== null)
      .at(-1)
  const done = phase === 'done'
  const qtyText = String(qty).replace('.', ',')
  const yourSum = Math.round(qty * 1000 * data.final_price)
  const saving = Math.round(qty * 1000 * (data.retail_uzs - data.final_price))
  const w: Seller = data.winner

  const result = done && (
    <div className="card result fade">
      <div className="res-top">
        <div className="res-who">
          <span className="cap">Победитель торгов</span>
          <span className="res-id">
            <Logo id={w.id} name={w.name} lg />
            <b className="res-name">{w.name}</b>
          </span>
          <span className="meta">
            <Dr value={w.rating} kind="seller" />
            <span className="rel">{w.on_time_pct}% без срывов</span>
          </span>
        </div>
        <div className="res-price">
          <span className="cap">Цена для всех в пуле</span>
          <div className="big num">
            {fmt(data.final_price)}
            <small>сум/кг</small>
          </div>
        </div>
      </div>
      <div className="res-stats">
        <div>
          <b className="num">{fmt(yourSum)} сум</b>
          <span>за ваши {qtyText} т</span>
        </div>
        <div>
          <b className="num good">{fmt(saving)} сум</b>
          <span>экономия — на {data.below_retail_pct}% дешевле, чем в магазине</span>
        </div>
      </div>
      <details>
        <summary>
          <span>
            Почему победил этот продавец? <span className="muted small">объясняет Davra</span>
          </span>
        </summary>
        <div className="in">
          <p className="small muted">Последние ставки, сум/кг</p>
          <dl className="calc bids">
            {data.sellers
              .map((s, i) => ({ s, bid: lastBid(i, total)!, out: data.rounds[total - 1].bids[i].price === null }))
              .sort((a, b) => (a.s.id === w.id ? -1 : b.s.id === w.id ? 1 : a.bid - b.bid))
              .map(({ s, bid, out }) => (
                <div key={s.id} className={s.id === w.id ? 'tot first' : undefined}>
                  <dt>
                    {s.short} · {s.id === w.id ? `${s.on_time_pct}% без срывов` : out ? 'вышел' : 'не победил'}
                  </dt>
                  <dd className="num">{fmt(bid)}</dd>
                </div>
              ))}
          </dl>
          {data.explain.points.map((p) => (
            <p key={p} className="small muted">
              {p}
            </p>
          ))}
          {data.explain.source === 'template' && <p className="src">Текст собран по шаблону: Claude сейчас недоступен</p>}
        </div>
      </details>
    </div>
  )

  return (
    <section className="scr" aria-labelledby="h-auction">
      <h1 className="sr" id="h-auction">
        Торги
      </h1>
      {result}
      <div className="card">
        {!done && (
          <>
            <div className="a-head" aria-live="polite">
              <div>
                <span className="cap">Лучшая цена, сум/кг</span>
                <div className="big num">
                  <Roll text={cur ? fmt(cur.best_price) : '—'} />
                </div>
              </div>
              {phase === 'wait' ? (
                <span className="tag neutral">Запланированы</span>
              ) : (
                <span className="tag warning">
                  <span className="dot" />
                  Идут торги
                </span>
              )}
            </div>
            <div className="sched">
              <div className="meter">
                <i style={{ width: `${((round / total) * 100).toFixed(1)}%` }} />
              </div>
              <div className="seg-l">
                <span>
                  Раунд <b className="num">{round}</b> из {total}
                </span>
                <span>
                  {phase === 'wait' ? 'Старт через' : 'До конца'}{' '}
                  <b className="num">{phase === 'wait' ? `0:0${count}` : `${totalMin - (round - 1) * data.round_min} мин`}</b>
                </span>
              </div>
            </div>
            {phase === 'wait' && <p className="small muted">Торги начнутся сами — можно закрыть страницу и вернуться позже.</p>}
          </>
        )}
        <div className="lots-h">
          <h2>Продавцы на торгах</h2>
          <span className="small muted">
            {done
              ? `${total} раундов · ${totalMin} мин`
              : `${data.sellers.length} ${plural(data.sellers.length, 'продавец снижает', 'продавца снижают', 'продавцов снижают')} цену`}
          </span>
        </div>
        <div className="lots">
          {data.sellers.map((s, i) => {
            const bid = cur?.bids[i].price
            const out = !!cur && bid === null
            const best = !!cur && cur.leader_id === s.id
            const win = done && s.id === w.id
            const lb = lastBid(i, round)
            return (
              <div key={s.id} className={`lot${out ? ' out' : ''}${best ? ' best' : ''}${win ? ' win' : ''}`}>
                <Logo id={s.id} name={s.name} />
                <div className="nm">
                  <b>{s.name}</b>
                  <span className="meta">
                    <span className="ds">{s.about}</span>
                    <Dr value={s.rating} kind="seller" />
                  </span>
                </div>
                <div className="track">
                  <i style={{ width: '100%', clipPath: lb ? `inset(0 ${(100 - width(lb)).toFixed(1)}% 0 0 round 1000px)` : undefined }} />
                </div>
                <div className="pr">
                  {win && <span className="win-tag">Победитель</span>}
                  {out ? 'вышел' : bid ? <Roll text={fmt(bid)} /> : '—'}
                </div>
              </div>
            )
          })}
          {data.excluded.length > 0 && (
            <p className="excluded">
              Не допущен к торгам пулов (рейтинг ниже 4,0): {data.excluded.map((e) => `${e.name}, ${fmtDec(e.rating)}`).join('; ')}.
            </p>
          )}
        </div>
      </div>
      <ActionBar>
        {done && data.deal_id && (
          <button className="btn" type="button" onClick={onToDeal}>
            К сделке <Arrow />
          </button>
        )}
      </ActionBar>
    </section>
  )
}
