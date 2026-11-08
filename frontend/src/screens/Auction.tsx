import { useEffect, useRef, useState } from 'react'
import { api, type Auction as AuctionT } from '../api'
import { fmt, fmtDec, sleep } from '../format'
import { ActionBar, Arrow, ErrorNote, Roll } from '../components/ui'

const COUNTDOWN_S = 5
const ROUND_MS = 1400

type Phase = 'wait' | 'run' | 'done'

/**
 * Шаг 3: торги. Ставки и победителя считает бэкенд; экран проигрывает раунды ускоренно:
 * в демо 30 минут торгов занимают несколько секунд.
 */
export function Auction({
  poolId,
  data,
  played,
  onData,
  onPlayed,
  onToDeal,
}: {
  poolId: string
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
      setCount(0)
      setPhase('run')
      for (let r = 1; r <= data.rounds.length; r++) {
        setRound(r)
        await sleep(ROUND_MS)
      }
      setPhase('done')
      onPlayed()
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

  let clockLabel = 'Старт через'
  let clock = <Roll text={`0:0${count}`} />
  if (phase === 'run') {
    clockLabel = 'До конца торгов'
    clock = <Roll text={String(totalMin - (round - 1) * data.round_min)} small="мин" />
  } else if (phase === 'done') {
    clockLabel = 'Торги длились'
    clock = <Roll text={String(totalMin)} small="мин" />
  }

  return (
    <section className="scr" aria-labelledby="h-auction">
      <h1 className="sr" id="h-auction">
        Торги
      </h1>
      <div className="card">
        <div className="ticker" aria-live="polite">
          <div>
            <span className="cap">{clockLabel}</span>
            <div className="big num">{clock}</div>
          </div>
          <div>
            <span className="cap">Лучшая цена, сум/кг</span>
            <div className="big num">
              <Roll text={cur ? fmt(cur.best_price) : '—'} />
            </div>
          </div>
          <div>
            <span className="cap">Раунд</span>
            <div className="big num">
              <Roll text={String(round)} small={`из ${total}`} />
            </div>
          </div>
          {phase === 'wait' && <span className="tag neutral">Запланированы</span>}
          {phase === 'run' && (
            <span className="tag warning">
              <span className="dot" />
              Идут торги
            </span>
          )}
          {phase === 'done' && <span className="tag success">Завершены · победил {data.winner.short}</span>}
        </div>
        <div className="sched">
          <div className="meter">
            <i style={{ width: `${((round / total) * 100).toFixed(1)}%` }} />
          </div>
          <div className="seg-l">
            <span>Старт · автоматически</span>
            <span>
              {totalMin} мин · {total} раундов по {data.round_min} мин
            </span>
          </div>
        </div>
        <p className="small">
          {phase === 'wait' && 'Торги запускает биржа сама, как только пул собран. Делать ничего не нужно: можно закрыть страницу, итог придёт уведомлением.'}
          {phase === 'run' && `Торги идут. Каждый раунд длится ${data.round_min} минут, продавцы могут только снижать цену.`}
          {phase === 'done' && `Торги завершены автоматически после ${total}-го раунда.`}
        </p>
        <div className="lots">
          {data.sellers.map((s, i) => {
            const bid = cur?.bids[i].price
            const out = !!cur && bid === null
            // У вышедшего продавца полоса остается на его последней цене, как в макете.
            const lastBid = data.rounds
              .slice(0, round)
              .map((r) => r.bids[i].price)
              .filter((p): p is number => p !== null)
              .at(-1)
            const best = !!cur && cur.leader_id === s.id
            return (
              <div key={s.id} className={`lot${out ? ' out' : ''}${best ? ' best' : ''}`}>
                <div className="nm">
                  {s.name}
                  <small>
                    рейтинг {fmtDec(s.rating)} · {s.on_time_pct}% без срывов
                  </small>
                </div>
                <div className="track">
                  <i style={{ width: '100%', clipPath: lastBid ? `inset(0 ${(100 - width(lastBid)).toFixed(1)}% 0 0 round 1000px)` : undefined }} />
                </div>
                <div className="pr">{out ? 'вышел' : bid ? <Roll text={fmt(bid)} /> : '—'}</div>
              </div>
            )
          })}
        </div>
        <p className="small muted">
          Рядом с продавцом указаны рейтинг и доля поставок без срывов. Продавцы с рейтингом ниже 4,0 к торгам пулов не допускаются
          {data.excluded.length > 0 ? `: в этот раз не допущен ${data.excluded.map((e) => `${e.name} (${fmtDec(e.rating)})`).join(', ')}.` : '.'}
        </p>
      </div>
      {phase === 'done' && (
        <div className="card band explain fade">
          <h2>ИИ объясняет, как сложилась цена {fmt(data.final_price)} сум/кг</h2>
          <ol>
            {data.explain.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
          {data.explain.source === 'template' && <p className="src">Текст собран по шаблону: Claude сейчас недоступен</p>}
        </div>
      )}
      <ActionBar>
        {phase === 'done' && data.deal_id && (
          <button className="btn inverse" type="button" onClick={onToDeal}>
            К сделке <Arrow />
          </button>
        )}
      </ActionBar>
    </section>
  )
}
