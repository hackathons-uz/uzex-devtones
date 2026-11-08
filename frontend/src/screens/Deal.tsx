import { useEffect, useState, type ReactNode } from 'react'
import { api, type Deal as DealT } from '../api'
import { fmt, plural, sleep } from '../format'
import { ActionBar, Arrow, Check, Dr, ErrorNote } from '../components/ui'

/** Шаг 4: сделка. Стадии хранит бэкенд; экран показывает ход эскроу и расчета. */
export function Deal({
  dealId,
  deal,
  onDeal,
  onSettled,
  onDispute,
}: {
  dealId: string
  deal: DealT | null
  onDeal: (d: DealT) => void
  onSettled: (d: DealT) => void
  onDispute: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  // Промежуточная стадия на время анимации: «оплачено» до «отгружено», «получено» до «расчет».
  const [visualStage, setVisualStage] = useState<number | null>(null)

  useEffect(() => {
    setError(null)
    api
      .deal(dealId)
      .then(onDeal)
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, attempt])

  async function act(kind: 'pay' | 'confirm' | 'dispute') {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (kind === 'pay') {
        const d = await api.pay(dealId)
        setVisualStage(2)
        await sleep(1300)
        onDeal(d)
      } else if (kind === 'confirm') {
        const d = await api.confirm(dealId)
        setVisualStage(4)
        await sleep(900)
        onDeal(d)
        onSettled(d)
      } else {
        onDeal(await api.openDispute(dealId))
        onDispute()
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setVisualStage(null)
      setBusy(false)
    }
  }

  if (!deal) {
    return (
      <section className="scr">
        {error ? <ErrorNote error={error} onRetry={() => setAttempt((a) => a + 1)} /> : <p className="loading">Загружаю сделку…</p>}
      </section>
    )
  }

  const stage = visualStage ?? deal.stage
  const shortKg = Math.round(deal.refund_uzs / deal.price_uzs)
  const receiptText =
    deal.status === 'dispute'
      ? 'Спор открыт. Деньги заморожены, пока не решим.'
      : deal.status === 'arbiter'
        ? 'Спор у арбитра, ответ до 48 часов.'
        : deal.refund_uzs > 0
          ? `Спор закрыт: вам вернули деньги за ${fmt(shortKg)} кг.`
          : 'Проверьте вес и качество, когда заберёте.'
  const settleText =
    deal.status !== 'settled'
      ? 'Продавец получает деньги, вам возвращается задаток.'
      : deal.refund_uzs > 0
        ? `${fmt(deal.to_seller_uzs)} сум переведены продавцу. ${fmt(deal.refund_uzs)} сум и задаток ${fmt(deal.deposit_uzs)} сум вернулись на ваш счёт.`
        : `${fmt(deal.total_uzs)} сум переведены продавцу. Задаток ${fmt(deal.deposit_uzs)} сум вернулся на ваш счёт.`

  const steps: { title: string; text: string; act?: ReactNode }[] = [
    { title: 'Задаток заморожен', text: `${fmt(deal.deposit_uzs)} сум хранятся у биржи` },
    { title: 'Оплата на защищённый счёт', text: `${fmt(deal.total_uzs)} сум. Продавец получит их, только когда вы заберёте муку.` },
    {
      title: 'Доставка на склад',
      text: `Вагон едет на склад. Davra разделит муку на всех (${deal.recipients} ${plural(deal.recipients, 'получатель', 'получателя', 'получателей')}) и скажет, когда забрать.`,
    },
    { title: 'Получение', text: receiptText },
    { title: 'Готово', text: settleText },
  ]

  let actions: ReactNode = null
  if (deal.status === 'active' && stage === 1)
    actions = (
      <button className="btn" type="button" onClick={() => act('pay')} disabled={busy}>
        Оплатить через банк
      </button>
    )
  else if (deal.status === 'active' && stage === 3)
    actions = (
      <>
        <button className="btn" type="button" onClick={() => act('confirm')} disabled={busy}>
          Забрал, всё ок
        </button>
        <button className="btn outline" type="button" onClick={() => act('dispute')} disabled={busy}>
          Открыть спор
        </button>
      </>
    )
  else if (deal.status === 'dispute' || deal.status === 'arbiter')
    actions = (
      <button className="btn" type="button" onClick={onDispute}>
        К спору <Arrow />
      </button>
    )

  return (
    <section className="scr" aria-labelledby="h-deal">
      <h1 className="sr" id="h-deal">
        Сделка
      </h1>
      {error && <ErrorNote error={error} />}
      <div className="grid2">
        <div className="card">
          <h2>Сделка № {deal.id}</h2>
          <dl className="spec">
            <dt>Товар</dt>
            <dd>{deal.product}</dd>
            <dt>Цена</dt>
            <dd className="num">{`${fmt(deal.price_uzs)} сум/кг`}</dd>
            <dt>Сумма</dt>
            <dd className="num">{`${fmt(deal.total_uzs)} сум`}</dd>
            <dt>Продавец</dt>
            <dd>
              {deal.seller.name}
              <Dr value={deal.seller.rating} kind="seller" />
            </dd>
            <dt>Доставка</dt>
            <dd>
              {deal.hub}, {deal.delivery_text}
            </dd>
          </dl>
        </div>
        <div className="card">
          <ol className="tl">
            {steps.map((s, k) => (
              <li key={s.title} className={k < stage ? 'done' : k === stage ? 'cur' : 'pend'}>
                <span className="dot">{k < stage ? <Check /> : k + 1}</span>
                <div className="bd">
                  <b>{s.title}</b>
                  <span className="small muted">{s.text}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <ActionBar>{actions}</ActionBar>
    </section>
  )
}
