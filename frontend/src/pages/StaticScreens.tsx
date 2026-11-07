// Остальные экраны PRD: статичные, но на тех же данных и формулах бэкенда.
import { api } from '../api'
import { ErrorBox, Icon, Scale, Trust, useLoad } from '../components/ui'
import { date, deals, mln, pct, sum, t } from '../format'

function Shell({ title, lead, children }: { title: React.ReactNode; lead: string; children: React.ReactNode }) {
  return (
    <section className="screen screen--narrow">
      <div className="col-main">
        <h1 className="h1">{title}</h1>
        <p className="lead">{lead}</p>
        {children}
      </div>
    </section>
  )
}

export function SearchScreen() {
  // Запрос в поле — пример «цемент М400 в Фергану, 20 т»: показываем только подходящие лоты.
  const q = useLoad(() => api.lots('stroyplus', 20), [])
  const found = q.data?.filter((l) => l.product.toLowerCase().includes('цемент'))
  return (
    <Shell title="Поиск с ценой до двери" lead="Цена за тонну на складе в другом городе ничего не говорит. Показываем реальную цену с доставкой до Ферганы.">
      <div className="ask" aria-hidden="true">
        <span className="ask__input" style={{ color: 'var(--graphite)' }}>
          цемент М400 в Фергану, 20 т
        </span>
        <span className="ask__send">{Icon.arrow}</span>
      </div>
      <ErrorBox error={q.error} />
      <div className="block">
        {found?.map((l) => (
          <div key={l.id} className="card">
            <div className="row" style={{ borderTop: 0, padding: 0 }}>
              <span className="row__name">
                {l.title}, {t(l.volume_t)}
                <span className="row__meta">
                  {l.seller.name} · склад: {l.region} · {deals(l.seller.completed_deals)}, срывов за год: {l.seller.defaults_12m}
                </span>
              </span>
              <span />
              <Trust r={l.seller.rating} />
            </div>
            {l.delivery_estimate && (
              <div className="compare">
                <div className="compare__cell">
                  <div className="compare__k">Цена на складе</div>
                  <div className="compare__v">{sum(l.price_per_t)}</div>
                  <div className="compare__s">за тонну</div>
                </div>
                <div className="compare__cell compare__cell--win">
                  <div className="compare__k">Реальная цена</div>
                  <div className="compare__v">{sum(l.delivery_estimate.real_price_per_t)}</div>
                  <div className="compare__s">
                    доставка {t(l.delivery_estimate.qty_t)} на {l.delivery_estimate.km} км: {sum(l.delivery_estimate.per_t_uzs)} за тонну — оценка
                  </div>
                </div>
              </div>
            )}
            <p className="hint">Правила продавца: {l.rule_lines.join('; ')}.</p>
          </div>
        ))}
      </div>
    </Shell>
  )
}

export function GuaranteeScreen() {
  const alone = useLoad(() => api.preview({ buyer_id: 'stroyplus', lot_id: 'lot-cement', qty_t: 20 }), [])
  const backed = useLoad(() => api.preview({ buyer_id: 'stroyplus', lot_id: 'lot-cement', qty_t: 20, guarantor_id: 'nadezhny' }), [])
  const sugar = useLoad(() => api.preview({ buyer_id: 'stroyplus', lot_id: 'lot-sugar', qty_t: 2, guarantor_id: 'nadezhny' }), [])
  return (
    <Shell title="Надежная компания ручается за новичка" lead="Поручитель с рейтингом 80+ ставит свою репутацию. Пока поручительство действует, продавец видит рейтинг поручителя.">
      <ErrorBox error={alone.error || backed.error} />
      {alone.data && backed.data && (
        <div className="compare block">
          <div className="compare__cell">
            <div className="compare__k">СтройПлюс сам</div>
            <div className="compare__v">{pct(alone.data.deposit.pct)}</div>
            <div className="compare__s">залог {sum(alone.data.deposit.deposit_uzs)} на {mln(alone.data.amount_uzs)}</div>
          </div>
          <div className="compare__cell compare__cell--win">
            <div className="compare__k">За него ручается Надежный Строй (92)</div>
            <div className="compare__v">{pct(backed.data.deposit.pct)}</div>
            <div className="compare__s">залог {sum(backed.data.deposit.deposit_uzs)}, не ниже 3%</div>
          </div>
        </div>
      )}
      {sugar.data && (
        <div className="card block">
          <h2 className="h2">Лот с правилом «от рейтинга 70»</h2>
          <p className="ai-text">
            {sugar.data.admission.admitted
              ? `С поручителем СтройПлюс допущен с первой сделки: продавец видит рейтинг ${sugar.data.admission.effective_rating}.`
              : sugar.data.admission.reasons.map((r) => r.message).join('; ')}
          </p>
        </div>
      )}
      <div className="card">
        <ul className="checks" style={{ marginTop: 0 }}>
          <li>{Icon.check}Сделка прошла хорошо — рейтинг растет у обоих</li>
          <li>{Icon.check}Срыв — баллы теряют оба, поэтому ручаться за кого попало невыгодно</li>
          <li>{Icon.check}Не больше 3 активных поручительств у одного участника</li>
        </ul>
      </div>
    </Shell>
  )
}

export function InsuranceScreen() {
  const f = useLoad(() => api.fund(), [])
  const ins = useLoad(() => api.preview({ buyer_id: 'nadezhny', lot_id: 'lot-cement', qty_t: 40, payment_mode: 'insurance' }), [])
  return (
    <Shell title="Страховка вместо залога" lead="Небольшой невозвратный взнос в общий фонд вместо замороженных денег. Доступно с рейтинга 60 и до 300 млн сум.">
      <ErrorBox error={f.error || ins.error} />
      {ins.data && (
        <div className="card card--island block">
          <div className="sum">
            <div className="sum__row">
              <span>Надежный Строй, цемент {t(ins.data.qty_t)}</span>
              <b>{sum(ins.data.amount_uzs)}</b>
            </div>
            <div className="sum__row">
              <span>Залог</span>
              <b>{sum(ins.data.deposit.deposit_uzs)}</b>
            </div>
            <div className="sum__total">
              <span className="muted">Взнос в фонд, {pct(ins.data.deposit.fee_pct ?? 0)}</span>
              <b>{sum(ins.data.deposit.fee_uzs)}</b>
            </div>
          </div>
        </div>
      )}
      {f.data && (
        <div className="card">
          <h2 className="h2">Фонд {f.data.sustainable ? 'устойчив' : 'не устойчив'}</h2>
          <p className="ai-text">
            Пример: доля срывов {pct(f.data.default_rate_pct)} × убыток на срыв {pct(f.data.max_loss_pct)} = {pct(f.data.expected_loss_pct)} от суммы
            сделки. Это {f.data.sustainable ? 'не больше' : 'больше'} среднего взноса {pct(f.data.fee_pct)}. Все цифры условные.
          </p>
          <p className="ai-text">
            У надежных участников срывов меньше, поэтому взнос ниже. Каждый тариф выдерживает свою долю срывов при том же убытке:
          </p>
          <div className="fields">
            {f.data.fee_tiers.map((x) => (
              <div key={x.min_rating} className="field">
                <span>
                  Рейтинг от {x.min_rating}: взнос {pct(x.pct)}
                </span>
                <span>срывов до {pct(x.max_default_rate_pct)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Shell>
  )
}

export function DealScreen() {
  const p = useLoad(() => api.preview({ buyer_id: 'stroyplus', lot_id: 'lot-cement', qty_t: 20 }), [])
  const steps = p.data
    ? [
        ['Заявка подана', `${t(p.data.qty_t)} цемента, ${sum(p.data.amount_uzs)}`, true],
        ['Залог заблокирован', `${sum(p.data.deposit.deposit_uzs)} на гарантийном счете биржи`, true],
        ['Остаток на эскроу', `${sum(p.data.escrow_rest_uzs)} — продавец получит после подтверждения`, false],
        ['Поставка', `Привезут до ${date('2026-11-25')}. Покупатель проверяет и подтверждает получение`, false],
        ['Продавец получил деньги', 'Деньги уходят с эскроу продавцу. Обе стороны оценивают друг друга', false],
      ]
    : []
  return (
    <Shell title="Сделка через гаранта" lead="Биржа держит залог и деньги на эскроу, пока покупатель не подтвердит поставку. Отказ продавца — залог возвращается. Срыв покупателя — залог уходит продавцу.">
      <ErrorBox error={p.error} />
      <ol className="tl">
        {steps.map(([title, sub, done], i) => (
          <li key={String(title)} className={`tl__i ${done ? 'is-done' : i === 2 ? 'is-now' : ''}`}>
            <span className="tl__c">{done ? Icon.check : i + 1}</span>
            <div>
              <div className="tl__t">{title}</div>
              <div className="tl__s">{sub}</div>
            </div>
          </li>
        ))}
      </ol>
      {p.data && (
        <div className="card card--island block">
          <div className="deposit" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
            <div className="deposit__head">
              <span className="muted">После честной сделки рейтинг</span>
              <span className="deposit__amt">
                {p.data.buyer.rating} → {p.data.after_next_deal.rating}
              </span>
            </div>
            <Scale pct={p.data.after_next_deal.deposit_pct} />
            <p>Статусы и суммы в демо — заглушки: реальных платежей нет.</p>
          </div>
        </div>
      )}
    </Shell>
  )
}

const KIND = { admission: 'Допуск', deposit: 'Залог', risk: 'Риск', pool: 'Пул', rule_parse: 'Правило' } as Record<string, string>
const SRC = { ai: 'ИИ', template: 'шаблон', formula: 'формула' } as Record<string, string>

export function JournalScreen() {
  const q = useLoad(() => api.decisions(), [])
  return (
    <Shell
      title="Журнал решений"
      lead="Каждое решение системы записано: что решено и почему. По журналу биржа разбирает споры и доказывает честность торгов. Одинаковое решение подряд не дублируется, а примерка залога до подачи заявки — не решение."
    >
      <ErrorBox error={q.error} />
      <div className="rows block">
        {q.data?.length === 0 && <p className="hint">Пока пусто. Пройдите шаги демо.</p>}
        {q.data?.map((d) => (
          <div key={d.id} className="row">
            <span className="row__name">
              {KIND[d.kind] ?? d.kind} · {d.title}
              <span className="row__meta">{d.summary}</span>
              {d.explanation && <span className="row__meta">Объяснение: {d.explanation}</span>}
            </span>
            <span className="state">{SRC[d.source]}</span>
            <span className="row__meta">{d.created_at.slice(11, 16)}</span>
          </div>
        ))}
      </div>
    </Shell>
  )
}
