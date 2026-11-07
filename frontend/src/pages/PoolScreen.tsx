import { useState } from 'react'
import { api, type Pool } from '../api'
import { AiCard, Button, ErrorBox, Icon, PoolBar, Reveal, SourceLabel, Trust, useLoad } from '../components/ui'
import { sum, t } from '../format'

const LOT = 'lot-cement'
const YOU = 'stroyplus'

export function PoolScreen() {
  const q = useLoad(() => api.poolProposals(LOT), [])
  const [pool, setPool] = useState<Pool | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  const current = pool ?? q.data?.pools[0] ?? null

  const act = async (kind: 'confirm' | 'withdraw', pid: string) => {
    if (!current) return
    setBusy(pid + kind)
    setError(null)
    try {
      setPool(kind === 'confirm' ? await api.poolConfirm(current.id, pid) : await api.poolWithdraw(current.id, pid))
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  if (q.error) return <Narrow><ErrorBox error={q.error} /></Narrow>
  if (!q.data) return <Narrow><AiCard tag="ИИ ищет похожий спрос" thinking title="Ищем покупателей рядом с тем же товаром" /></Narrow>
  if (!current)
    return (
      <Narrow>
        <h1 className="h1">Пула пока нет</h1>
        <p className="lead">{emptyReason(q.data)}</p>
        <div className="actions">
          <a className="btn" href="#deposit">
            <span className="btn__label">Вернуться к заявке</span>
          </a>
        </div>
      </Narrow>
    )

  const locked = current.status === 'locked'
  const failed = current.status === 'failed'
  const others = current.members.length - 1
  const segs = current.members.map((m) => ({
    id: m.request_id,
    t: m.share_t,
    kind: (m.buyer_id === YOU ? 'you' : m.confirmed ? 'ok' : 'wait') as 'you' | 'ok' | 'wait',
  }))

  return (
    <>
      <div className="strip">
        <div className="strip__lot">
          <span className="strip__dot" aria-hidden="true" />
          Пул: {current.lot_title}, {t(current.volume_t)}
        </div>
        <PoolBar segments={failed ? [] : segs} total={current.volume_t} />
        <div className="strip__count">
          <b className="num">{failed ? 0 : current.total_t}</b> из {t(current.volume_t)}
        </div>
      </div>

      <section className="screen" aria-labelledby="h">
        <div className="col-main">
          <div className="h1-row">
            <h1 className="h1" id="h">
              Купите цемент <span className="mark">вместе</span>
            </h1>
            <span className={`live ${locked ? 'is-done' : failed ? 'is-alert' : ''}`}>
              {locked ? Icon.check : <span className="live__dot" />}
              {locked ? 'Пул собран' : failed ? 'Пул распался' : `Подтвердили ${current.confirmed_count} из ${current.members.length}`}
            </span>
          </div>

          <AiCard
            tag={current.explanation.source === 'ai' ? 'ИИ объясняет пул' : 'Пул подобран по правилам'}
            className="block"
            title={locked ? `Вы и еще ${others} покупателя купили цемент вместе` : `Еще ${others} покупателя рядом ищут тот же цемент`}
          >
            <p className="ai-text" key={current.explanation.text}>
              <Reveal text={current.explanation.text} />
            </p>
            <div className="compare">
              <div className="compare__cell">
                <div className="compare__k">Доставка по отдельности</div>
                <div className="compare__v">{sum(current.alone_cost_uzs)}</div>
                <div className="compare__s">каждый своей машиной</div>
              </div>
              <div className={`compare__cell ${current.saving_uzs > 0 ? 'compare__cell--win' : ''}`}>
                <div className="compare__k">Доставка в пуле</div>
                <div className="compare__v">{sum(current.pool_cost_uzs)}</div>
                <div className="compare__s">
                  {current.trips} рейса по маршруту {current.route_km} км ·{' '}
                  {current.saving_uzs >= 0 ? `дешевле на ${sum(current.saving_uzs)}` : `дороже на ${sum(-current.saving_uzs)}`}
                </div>
              </div>
            </div>
            <SourceLabel e={current.explanation} />
          </AiCard>

          <div className="block">
            <span className="label">Участники: каждый отвечает только за свою долю</span>
            <div className="rows">
              {current.members.map((m) => (
                <div key={m.request_id} className="row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto auto' }}>
                  <span className="row__name">
                    {m.buyer_name}
                    {m.buyer_id === YOU && <span className="you">вы</span>}
                    <span className="row__meta">
                      {m.region} · залог {sum(m.deposit_uzs)} ({m.deposit_pct}%) · доставка {sum(m.pool_share_uzs)} вместо {sum(m.alone_uzs)}
                      {m.saving_uzs < 0 && <span className="neg"> (+{sum(-m.saving_uzs)})</span>}
                    </span>
                  </span>
                  <span className="row__t num">{t(m.share_t)}</span>
                  <Trust r={m.buyer_rating} />
                  <span className="member__act">
                    {m.confirmed ? (
                      <span className="done">{Icon.check} Участвует</span>
                    ) : (
                      <button type="button" className="mini" disabled={locked || failed || busy !== null} onClick={() => act('confirm', m.buyer_id)}>
                        {busy === m.buyer_id + 'confirm' ? 'Секунду…' : 'Участвую'}
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {current.replan && <div className="error">{current.replan.message}</div>}
            {current.replaced_pool_id && <p className="note">ИИ пересобрал пул без выбывшего участника. Подтверждения остальных сохранены.</p>}
            <ErrorBox error={error} />
          </div>
        </div>

        <div className="col-side">
          <div className="card">
            <h2 className="h2">Маршрут общей машины</h2>
            <ol className="tl" style={{ marginTop: 16 }}>
              <li className="tl__i is-done">
                <span className="tl__c">{Icon.truck}</span>
                <div>
                  <div className="tl__t">Склад {current.seller.name}</div>
                  <div className="tl__s">{current.seller_region}</div>
                </div>
              </li>
              {current.route.map((leg, i) => (
                <li key={leg.request_id} className={`tl__i ${locked ? 'is-done' : ''}`}>
                  <span className="tl__c">{i + 1}</span>
                  <div>
                    <div className="tl__t">{leg.buyer_name}</div>
                    <div className="tl__s">
                      {leg.region} · +{leg.km} км
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <p className="hint">
              Машина везет до 25 т. Стоимость рейса: 300 000 сум плюс 1 500 сум за км, делим по тоннам. Доставка — оценка.
            </p>
          </div>
          {current.excluded.length > 0 && (
            <div className="card">
              <h2 className="h2">Не вошли в пул</h2>
              <div className="rows">
                {current.excluded.map((e) => (
                  <div key={e.request_id} className="row is-out" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                    <span className="row__name">
                      {e.buyer_name}
                      <span className="row__meta">{e.message}</span>
                    </span>
                    <span className="row__t num">{t(e.qty_t)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="actions col-act">
          {!locked && !failed && (
            <Button ghost onClick={() => act('withdraw', 'megastroy')} busy={busy === 'megastroywithdraw'}>
              Показать выход участника
            </Button>
          )}
          {locked && (
            <span className="state state--ok">
              {Icon.check} Залоги всех участников заблокированы, лот закрыт для других
            </span>
          )}
        </div>
      </section>
    </>
  )
}

type Proposals = Awaited<ReturnType<typeof api.poolProposals>>

function emptyReason(d: Proposals): string {
  const det = d.details
  if (d.reason === 'not_enough_volume' && det)
    return `Подходящих заявок хватает только на ${t(det.max_collected_t ?? 0)}, а для пула нужно от ${t(det.min_fill_t ?? 0)}. Возможно, продавец ужесточил правила. Чтобы начать заново, выберите «Еще» → «Сбросить демо».`
  if (d.reason === 'pool_not_allowed') return 'Продавец не разрешает покупать этот лот пулом.'
  if (d.reason === 'no_candidates') return 'Пока нет открытых заявок, которые проходят правила продавца.'
  return 'Подходящих заявок не хватает, чтобы собрать лот.'
}

function Narrow({ children }: { children: React.ReactNode }) {
  return (
    <section className="screen screen--narrow">
      <div className="col-main">{children}</div>
    </section>
  )
}
