import { useEffect, useState } from 'react'
import { api, type Pool as PoolT } from '../api'
import { fmt, pct, plural, pp, sleep } from '../format'
import { ActionBar, Arrow, Check, ErrorNote, Ring, Roll, Seg } from '../components/ui'

type Shown = { segments: PoolT['segments']; members: number; left: number }

const shownOf = (p: PoolT): Shown => ({ segments: p.segments, members: p.members, left: p.left_t })

/** Шаг 2: пул и задаток. Цена и задаток — с бэкенда, по формулам; здесь только показ. */
export function Pool({
  poolId,
  qty,
  pool,
  onPool,
  onToAuction,
}: {
  poolId: string
  qty: number
  pool: PoolT | null
  onPool: (p: PoolT) => void
  onToAuction: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [joining, setJoining] = useState(false)
  const [shown, setShown] = useState<Shown | null>(pool && shownOf(pool))
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    if (pool) return
    setError(null)
    api
      .pool(poolId, qty)
      .then((p) => {
        onPool(p)
        setShown(shownOf(p))
      })
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId, qty, attempt])

  async function join() {
    if (!pool || joining) return
    setJoining(true)
    setError(null)
    try {
      const r = await api.join(pool.id, pool.qty_t)
      setAnimating(true)
      // Сначала ваша доля, затем по очереди подтвержденные заявки из очереди, как в макете.
      const youSeg = { you: true, qty_t: pool.qty_t }
      let segs = [...pool.segments, youSeg]
      let members = pool.members + 1
      let left = pool.left_t - pool.qty_t
      setShown({ segments: segs, members, left })
      onPool({ ...pool, you: r.pool.you })
      await sleep(800)
      for (const ev of r.events) {
        for (let t = 1; t <= ev.qty_t; t++) {
          const extra = { you: false, qty_t: t }
          setShown({ segments: [...segs, extra], members, left })
          await sleep(40)
        }
        segs = [...segs, { you: false, qty_t: ev.qty_t }]
        members += 1
        left -= ev.qty_t
        setShown({ segments: segs, members, left })
        await sleep(560)
      }
      onPool(r.pool)
      setShown(shownOf(r.pool))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setJoining(false)
      setAnimating(false)
    }
  }

  if (!pool || !shown) {
    return (
      <section className="scr">
        {error ? <ErrorNote error={error} onRetry={() => setAttempt((a) => a + 1)} /> : <p className="loading">Загружаю пул…</p>}
      </section>
    )
  }

  const t = pool.trust
  const p = pool.price
  const filled = pool.status === 'filled' && !animating
  const qtyText = String(pool.qty_t).replace('.', ',')
  const deposit = pool.you.deposit_uzs ?? t.deposit_uzs

  return (
    <section className="scr" aria-labelledby="h-pool">
      <h1 className="sr" id="h-pool">
        Пул и задаток
      </h1>
      <div className="card">
        <div className="pool-hd">
          <div>
            <b>{pool.title}</b>
            <span className="small muted">
              {pool.audience} · {pool.city} · сбор до {pool.deadline_text}
            </span>
          </div>
          <span className={`tag ${filled ? 'success' : 'neutral'}`}>{filled ? 'Собран' : 'Собирается'}</span>
        </div>
        <div className="pool-body">
          <Ring lot={pool.lot_t} segments={shown.segments} full={filled} />
          <dl className="facts">
            <div>
              <dt>Участников</dt>
              <dd>
                <Roll text={String(shown.members)} />
              </dd>
            </div>
            <div>
              <dt>Лот</dt>
              <dd>
                {pool.lot_t} т<small>{pool.lot_unit}</small>
              </dd>
            </div>
            <div>
              <dt>Осталось собрать</dt>
              <dd>
                <Roll text={`${shown.left} т`} />
              </dd>
            </div>
            <div>
              <dt>До закрытия сбора</dt>
              <dd>
                {pool.days_left}
                <small>{plural(pool.days_left, 'день', 'дня', 'дней')}</small>
              </dd>
            </div>
          </dl>
        </div>
        <div className="legend">
          <span>
            <i style={{ background: 'var(--ink)' }} />
            Другие
          </span>
          <span>
            <i style={{ background: 'var(--orange)' }} />
            Ваши {qtyText} т
          </span>
          <span>
            <i style={{ background: 'var(--line)' }} />
            Свободно
          </span>
        </div>
      </div>
      {filled && (
        <div className="done-banner fade">
          Пул собран: {pool.lot_t} из {pool.lot_t} т, {pool.members} {plural(pool.members, 'участник', 'участника', 'участников')}. Биржа запустит торги автоматически.
        </div>
      )}
      {error && <ErrorNote error={error} />}

      <div className="grid2">
        <div className="card">
          <span className="cap">Ожидаемая цена для вас</span>
          <div className="big">
            {fmt(p.expected_uzs)}
            <small>сум/кг</small>
          </div>
          <p>
            <b className="good">−{p.discount_pct}%</b> к рознице{' '}
            <span className="muted">
              ({fmt(p.retail_uzs)} сум/кг в {pool.city === 'Самарканд' ? 'Самарканде' : pool.city})
            </span>
          </p>
          <p className="small muted">
            Ваши {qtyText} т ≈ {fmt(p.order_uzs)} сум вместо {fmt(p.retail_order_uzs)} сум
          </p>
          <details>
            <summary>Откуда эта цифра</summary>
            <div className="in">
              <p>
                Средняя биржевая цена за {p.avg_month}: {fmt(p.avg_exchange_uzs)} сум/кг.
              </p>
              <p>
                За полный {pool.lot_unit} продавцы дают скидку {p.volume_discount_pct[0]}–{p.volume_discount_pct[1]}% за объём.
              </p>
              <p>
                {p.sellers_confirmed} {plural(p.sellers_confirmed, 'проверенный продавец уже подтвердил', 'проверенных продавца уже подтвердили', 'проверенных продавцов уже подтвердили')} участие.
              </p>
              <p className="muted">Итоговую цену определят торги, а не ИИ.</p>
            </div>
          </details>
        </div>
        <div className="card">
          <span className="cap">Ваш задаток</span>
          <div className="big">
            {pct(t.deposit_pct)}
            <small>{fmt(deposit)} сум</small>
          </div>
          <Seg value={t.deposit_pct} max={t.deposit_max_pct} />
          <div className="seg-l">
            <span>{pct(t.deposit_min_pct)}</span>
            <span>{pct(t.deposit_max_pct)}</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small">Рейтинг надёжности</span>
            <b className="num">{t.rating} / 100</b>
          </div>
          <div className="meter" aria-hidden="true">
            <i style={{ width: `${t.rating}%` }} />
          </div>
          <details open>
            <summary>
              Почему {pct(t.deposit_pct)}, а не {pct(t.deposit_max_pct)}
            </summary>
            <div className="in">
              <ul className="f">
                {t.factors.map((f) => (
                  <li key={f.key}>
                    <span className={f.points >= 0 ? 'good' : 'bad'}>{f.points >= 0 ? '+' : '−'}</span>
                    <span>{f.label}</span>
                    <b className={f.points >= 0 ? 'good' : 'bad'}>{pp(f.deposit_pp)}</b>
                  </li>
                ))}
              </ul>
              {!!t.hint.deals && (
                <p className="small">
                  Ещё {t.hint.deals} {plural(t.hint.deals, 'сделка', 'сделки', 'сделок')} без задержек, и задаток станет не больше {pct(t.hint.target_pct)}.
                </p>
              )}
            </div>
          </details>
        </div>
      </div>

      <p className="note">
        Если пул не соберётся до {pool.deadline_text}, задаток вернётся полностью. Если участник откажется платить после торгов, его задаток уходит в страховой фонд пула, и остальные получают свой товар.
      </p>
      <ActionBar>
        {!pool.you.joined ? (
          <button className="btn" type="button" onClick={join} disabled={joining}>
            Внести задаток и вступить <Arrow />
          </button>
        ) : filled ? (
          <button className="btn fade" type="button" onClick={onToAuction}>
            Перейти к торгам <Arrow />
          </button>
        ) : (
          <span className="ok fade">
            <Check />
            Задаток внесён
          </span>
        )}
      </ActionBar>
    </section>
  )
}
