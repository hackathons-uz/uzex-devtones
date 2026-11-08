import { useEffect, useState } from 'react'
import { api, type Pool as PoolT } from '../api'
import { fmt, fmtDec, pct, plural, pp, sleep } from '../format'
import { ActionBar, Arrow, Check, Dr, ErrorNote, Ring, Roll } from '../components/ui'

// «В магазинах Самарканда»: город в родительном падеже.
const CITY_GEN: Record<string, string> = { Самарканд: 'Самарканда', Ташкент: 'Ташкента', Бухара: 'Бухары', Фергана: 'Ферганы', Андижан: 'Андижана', Наманган: 'Намангана', Навои: 'Навои', Карши: 'Карши', Нукус: 'Нукуса' }
// «за октябрь» -> «в октябре»: подпись в чеке цены, как в макете.
const MONTH_IN: Record<string, string> = { январь: 'январе', февраль: 'феврале', март: 'марте', апрель: 'апреле', май: 'мае', июнь: 'июне', июль: 'июле', август: 'августе', сентябрь: 'сентябре', октябрь: 'октябре', ноябрь: 'ноябре', декабрь: 'декабре' }

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
  const volPct = (p.volume_discount_pct[0] + p.volume_discount_pct[1]) / 2

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
              <dt>Цель</dt>
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
          Вагон собран: {pool.members} {plural(pool.members, 'участник', 'участника', 'участников')}. Торги начнутся сами.
        </div>
      )}
      {error && <ErrorNote error={error} />}

      <div className="grid2">
        <div className="card">
          <span className="cap">Ваша цена, примерно</span>
          <div className="big">
            {fmt(p.expected_uzs)}
            <small>сум/кг</small>
          </div>
          <p className="price-meta">
            <span>
              <b className="good">На {p.discount_pct}% дешевле</b>, чем в магазине
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <span className="num">{fmt(p.order_uzs)} сум</span> за {qtyText} т
            </span>
          </p>
          <details>
            <summary>Как посчитано</summary>
            <div className="in">
              <dl className="calc">
                <div>
                  <dt>Средняя цена на бирже в {MONTH_IN[p.avg_month] ?? p.avg_month}</dt>
                  <dd className="num">{fmt(p.avg_exchange_uzs)}</dd>
                </div>
                <div>
                  <dt>Скидка за большой объём, {fmtDec(volPct)}%</dt>
                  <dd className="num">−{fmt(p.avg_exchange_uzs - p.expected_uzs)}</dd>
                </div>
                <div className="tot">
                  <dt>Ваша цена</dt>
                  <dd className="num">{fmt(p.expected_uzs)} сум/кг</dd>
                </div>
              </dl>
              <p className="small muted">
                В магазинах {CITY_GEN[pool.city] ?? pool.city} — {fmt(p.retail_uzs)} сум/кг. Точную цену покажут торги.
              </p>
            </div>
          </details>
        </div>
        <div className="card">
          <span className="cap">Ваш задаток</span>
          <div className="big">
            {pct(t.deposit_pct)}
            <small>{fmt(deposit)} сум</small>
          </div>
          <div className="dep-r">
            <span className="small muted">Зависит от вашего рейтинга</span>
            <Dr value={t.rating} kind="buyer" />
          </div>
          <details>
            <summary>
              Почему {pct(t.deposit_pct)}, а не {pct(t.deposit_max_pct)}?
            </summary>
            <div className="in">
              <dl className="calc">
                <div>
                  <dt>Максимальный задаток</dt>
                  <dd className="num">{pct(t.deposit_max_pct)}</dd>
                </div>
                {t.factors.map((f) => (
                  <div key={f.key}>
                    <dt>{f.label}</dt>
                    <dd className="num">{pp(f.deposit_pp)}</dd>
                  </div>
                ))}
                <div className="tot">
                  <dt>Ваш задаток</dt>
                  <dd className="num">{pct(t.deposit_pct)}</dd>
                </div>
              </dl>
              {!!t.hint.deals && (
                <p className="small muted">
                  Ещё {t.hint.deals} {plural(t.hint.deals, 'сделка', 'сделки', 'сделок')} без задержек — и будет не больше {pct(t.hint.target_pct)}.
                </p>
              )}
            </div>
          </details>
          <p className="guard">
            <b>Без риска.</b> Пул не соберётся до {pool.deadline_text} — задаток вернётся. Кто-то не заплатит — вы всё равно получите свой товар.
          </p>
        </div>
      </div>

      <ActionBar>
        {!pool.you.joined ? (
          <button className="btn" type="button" onClick={join} disabled={joining}>
            Вступить в пул <Arrow />
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
