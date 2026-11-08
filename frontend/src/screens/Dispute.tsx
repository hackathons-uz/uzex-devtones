import { useEffect, useState } from 'react'
import { api, type Deal, type Dispute as DisputeT } from '../api'
import { fmt, plural } from '../format'
import { ActionBar, Arrow, ErrorNote } from '../components/ui'

/** Спор по сделке: открывается из сделки, отдельным шагом не считается. Решение считает бэкенд, принимает человек. */
export function Dispute({ dealId, onDeal, onBack }: { dealId: string; onDeal: (d: Deal) => void; onBack: () => void }) {
  const [data, setData] = useState<DisputeT | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setError(null)
    api
      .dispute(dealId)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [dealId, attempt])

  async function decide(kind: 'accept' | 'escalate') {
    setBusy(true)
    setError(null)
    try {
      const r = kind === 'accept' ? await api.accept(dealId) : await api.escalate(dealId)
      setData(r.dispute)
      onDeal(r.deal)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!data) {
    return (
      <section className="scr">
        {error ? <ErrorNote error={error} onRetry={() => setAttempt((a) => a + 1)} /> : <p className="loading">Загружаю спор…</p>}
      </section>
    )
  }

  const e = data.evidence
  const c = data.checks
  const d = data.decision
  const allOthers = c.confirmed_others === c.recipients - 1
  const open = data.status === 'dispute'

  return (
    <section className="scr" aria-labelledby="h-reg">
      <h1 className="sr" id="h-reg">
        Спор по сделке № {data.deal_id}
      </h1>
      <div className="status-line">
        <span className={`tag ${data.status === 'settled' ? 'success' : 'warning'}`}>
          {data.status === 'settled' ? 'Спор закрыт' : data.status === 'arbiter' ? 'У арбитра' : 'Спор открыт'}
        </span>
        <span className="small muted">
          Сделка № {data.deal_id} · {data.status === 'settled' ? 'деньги распределены по решению' : 'деньги в эскроу · решение до 48 часов'}
        </span>
      </div>
      {error && <ErrorNote error={error} />}
      <div className="grid2">
        <div className="card">
          <span className="cap">Доказательства</span>
          <h2>Недовес {fmt(d.shortfall_kg)} кг</h2>
          <ul className="f">
            <li>
              <span className="muted">·</span>
              <span>Накладная продавца</span>
              <b>{fmt(e.waybill_kg)} кг</b>
            </li>
            <li>
              <span className={d.shortfall_kg ? 'bad' : 'good'}>·</span>
              <span>Вес на хабе при выдаче</span>
              <b className={d.shortfall_kg ? 'bad' : 'good'}>{fmt(e.received_kg)} кг</b>
            </li>
            <li>
              <span className="muted">·</span>
              <span>Ваши фото мешков при приёмке</span>
              <b>{e.photos} фото</b>
            </li>
            <li>
              <span className={e.certificate_ok ? 'good' : 'bad'}>·</span>
              <span>Сертификат качества</span>
              <b className={e.certificate_ok ? 'good' : 'bad'}>{e.certificate_ok ? 'в норме' : 'не в норме'}</b>
            </li>
          </ul>
        </div>
        <div className="card">
          <span className="cap">Контроль сделки</span>
          <h2>Автоматическая проверка</h2>
          <ul className="f">
            <li>
              <span className={allOthers ? 'good' : 'bad'}>{allOthers ? '+' : '−'}</span>
              <span>
                {allOthers
                  ? `Остальные ${c.confirmed_others} ${plural(c.confirmed_others, 'получатель', 'получателя', 'получателей')} вагона подтвердили вес`
                  : `Вес подтвердили только ${c.confirmed_others} из ${c.recipients - 1} других получателей`}
              </span>
              <b />
            </li>
            <li>
              <span className={c.seller_linked ? 'bad' : 'good'}>{c.seller_linked ? '−' : '+'}</span>
              <span>{c.seller_linked ? 'Продавец связан с другими участниками торгов' : 'Продавец не связан с другими участниками торгов'}</span>
              <b />
            </li>
            <li>
              <span className={c.seller_disputes_12m <= 1 ? 'good' : 'bad'}>{c.seller_disputes_12m <= 1 ? '+' : '−'}</span>
              <span>
                У «{c.seller_short}» {c.seller_disputes_12m} {plural(c.seller_disputes_12m, 'спор', 'спора', 'споров')} за 12 месяцев
              </span>
              <b />
            </li>
            <li>
              <span className="bad">−</span>
              <span>{d.fault === 'hub' ? 'Недовес только в вашей партии: вероятно, ошибка при делении на хабе' : 'Недовес не только в вашей партии: вероятно, ошибка продавца'}</span>
              <b />
            </li>
          </ul>
        </div>
      </div>
      <div className="card band">
        <span className="cap">Предложенное решение · последнее слово за арбитром биржи</span>
        <p>
          Вернуть вам {fmt(d.refund_uzs)} сум за {fmt(d.shortfall_kg)} кг из эскроу, остальные {fmt(d.to_seller_uzs)} сум перевести продавцу.{' '}
          {d.seller_rating_changes ? 'Рейтинг продавца снизится: недовес по его вине.' : 'Рейтинг продавца не снижается: ошибка произошла на хабе, хаб компенсирует недовес.'}
        </p>
        {data.status === 'settled' && (
          <p>
            <b>Решение принято.</b> {fmt(d.refund_uzs)} сум вернутся вам вместе с задатком, продавец получит {fmt(d.to_seller_uzs)} сум.
          </p>
        )}
        {data.status === 'arbiter' && (
          <p>
            <b>Передано арбитру.</b> Человек-арбитр изучит доказательства, решение придёт до 48 часов. Деньги остаются в эскроу.
          </p>
        )}
      </div>
      <ActionBar>
        {open ? (
          <>
            <button className="btn" type="button" onClick={() => decide('accept')} disabled={busy}>
              Принять решение
            </button>
            <button className="btn inverse" type="button" onClick={() => decide('escalate')} disabled={busy}>
              Передать арбитру
            </button>
          </>
        ) : (
          <button className="btn" type="button" onClick={onBack}>
            Вернуться к сделке <Arrow />
          </button>
        )}
      </ActionBar>
    </section>
  )
}
