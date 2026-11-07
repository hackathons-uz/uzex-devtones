import { useState } from 'react'
import { api, type ParsedRule, type Rule, type SellerRequest } from '../api'
import { AiCard, Button, ErrorBox, Icon, Reveal, SourceLabel, Trust, useLoad } from '../components/ui'
import { deals, sum, t } from '../format'

const LOT = 'lot-cement'
const DEFAULT_TEXT = 'не продавать новичкам больше 5 т и пускать от рейтинга 40'
const EXAMPLES = [DEFAULT_TEXT, 'предоплата не меньше 15%', 'без поручителя только от рейтинга 60']
const RISK_WORD = { low: 'Риск низкий', medium: 'Риск средний', high: 'Риск высокий' }

const FIELDS: { key: keyof Rule; label: string; unit: string }[] = [
  { key: 'min_rating', label: 'Рейтинг покупателя от', unit: '' },
  { key: 'newbie_max_volume_t', label: 'Новичкам не больше', unit: 'т' },
  { key: 'min_prepay_pct', label: 'Минимальная предоплата', unit: '%' },
  { key: 'require_guarantor_below_rating', label: 'Поручитель, если рейтинг ниже', unit: '' },
]

export function SellerScreen() {
  const [text, setText] = useState(DEFAULT_TEXT)
  const [parsed, setParsed] = useState<ParsedRule | null>(null)
  const [draft, setDraft] = useState<Rule | null>(null)
  const [busy, setBusy] = useState<'parse' | 'save' | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [savedAt, setSavedAt] = useState(0)
  const list = useLoad(() => api.sellerRequests(LOT), [savedAt])

  const parse = async (value = text) => {
    setText(value)
    setBusy('parse')
    setError(null)
    setParsed(null)
    try {
      const r = await api.parseRule(LOT, value)
      setParsed(r)
      setDraft(
        r.rule ?? { min_rating: null, min_prepay_pct: null, newbie_max_volume_t: null, allow_pool: null, require_guarantor_below_rating: null },
      )
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }
  const save = async () => {
    if (!draft || !parsed) return
    setBusy('save')
    setError(null)
    try {
      await api.saveRule(LOT, draft, text, parsed.source)
      setParsed(null)
      setSavedAt(Date.now())
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="screen" aria-labelledby="h">
      <div className="col-main">
        <h1 className="h1" id="h">
          Правило один раз, <span className="mark">для всех</span>
        </h1>
        <p className="lead">Напишите условие обычными словами. ИИ превратит его в правило, вы подтвердите, а применять его будет код, одинаково ко всем.</p>

        <form
          className="ask"
          onSubmit={(e) => {
            e.preventDefault()
            parse()
          }}
        >
          <label className="sr" htmlFor="rule">
            Правило продавца
          </label>
          <textarea id="rule" className="ask__input" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="ask__send" aria-label="Разобрать правило" disabled={busy !== null}>
            {Icon.arrow}
          </button>
        </form>
        <div className="quick" aria-label="Примеры">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" className="chip" onClick={() => parse(x)}>
              {x}
            </button>
          ))}
        </div>

        {busy === 'parse' && <AiCard tag="ИИ разбирает правило" thinking className="block" title="Превращаю текст в условия" />}
        {parsed && draft && (
          <AiCard
            tag={parsed.manual ? 'Заполните вручную' : 'ИИ понял так'}
            className="block"
            title={parsed.manual ? 'ИИ сейчас недоступен. Заполните условия сами' : 'Проверьте правило перед тем, как оно начнет действовать'}
          >
            <div className="fields">
              {FIELDS.map((f) =>
                parsed.manual ? (
                  <label key={f.key} className="field field--edit">
                    <span>{f.label}</span>
                    <input
                      className="input num"
                      inputMode="decimal"
                      value={draft[f.key] == null ? '' : String(draft[f.key])}
                      placeholder="не задано"
                      onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </label>
                ) : (
                  <div key={f.key} className="field rise">
                    <span>{f.label}</span>
                    <span>{draft[f.key] == null ? 'не задано' : `${draft[f.key]}${f.unit ? ' ' + f.unit : ''}`}</span>
                  </div>
                ),
              )}
            </div>
            {parsed.unparsed.length > 0 && <p className="note">Не понял и не применяю: «{parsed.unparsed.join('», «')}»</p>}
            <SourceLabel e={parsed} />
            <div className="actions" style={{ marginTop: 24 }}>
              <Button icon busy={busy === 'save'} onClick={save}>
                Подтвердить правило
              </Button>
            </div>
          </AiCard>
        )}
        <ErrorBox error={error} />

        {list.data && (
          <div className="card block">
            <h2 className="h2">Сейчас действует</h2>
            <ul className="checks">
              {list.data.lot.rule_lines.map((l) => (
                <li key={l}>
                  {Icon.check}
                  {l}
                </li>
              ))}
            </ul>
            <p className="hint">Выбрать покупателя вручную нельзя: правило одно для всех. Каждое решение записано в журнал.</p>
          </div>
        )}
      </div>

      <div className="col-side">
        <div className="card">
          <h2 className="h2">Заявки на {list.data?.lot.title ?? 'лот'}</h2>
          <ErrorBox error={list.error} />
          <div className="rows">
            {list.data?.requests.map((r) => (
              <RequestRow key={r.id + savedAt} r={r} changed={savedAt > 0} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function RequestRow({ r, changed }: { r: SellerRequest; changed: boolean }) {
  const [open, setOpen] = useState(r.risk.level === 'high')
  const ok = r.admission.admitted
  return (
    <div className={`req ${changed ? 'req--changed' : ''}`}>
      <div className="req__head">
        <span className="row__name">
          {r.buyer.name}
          <span className="row__meta">
            {t(r.qty_t)} · {sum(r.amount_uzs)} · {r.buyer.is_newbie ? 'новичок' : deals(r.buyer.completed_deals)} · залог {r.deposit.pct}%
          </span>
        </span>
        <Trust r={r.buyer.rating} />
        <span className={`state ${ok ? 'state--ok' : 'state--bad'}`}>{ok ? 'Допущен' : 'Отказ'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 10 }}>
        <button type="button" className={`risk risk--${r.risk.level}`} onClick={() => setOpen(!open)} aria-expanded={open} style={{ border: 0, cursor: 'pointer' }}>
          {RISK_WORD[r.risk.level]}
          {r.risk.score > 0 ? ` · ${r.risk.score}` : ''}
        </button>
        {!ok && <span className="note" style={{ marginTop: 0 }}>{r.admission.reasons.map((x) => x.message).join('; ')}</span>}
        {r.admission.locked && (
          <span className="note" style={{ marginTop: 0 }}>
            Залог заблокирован в пуле.{r.admission.new_rule_would_reject ? ' Новое правило действует только для новых заявок.' : ''}
          </span>
        )}
      </div>
      {open && (
        <div className="req__why">
          <Reveal text={r.risk.explanation.text} />
          {r.risk.signals.length > 0 && (
            <ul className="checks" style={{ marginTop: 10 }}>
              {r.risk.signals.map((s) => (
                <li key={s.code} className="bad">
                  <b>+{s.points}</b> {s.message}
                </li>
              ))}
            </ul>
          )}
          <SourceLabel e={r.risk.explanation} />
          <p className="note">Оценка риска только подсказка. Допуск решает правило.</p>
        </div>
      )}
    </div>
  )
}
