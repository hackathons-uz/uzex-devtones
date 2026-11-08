import { useEffect, useState, type ReactNode } from 'react'
import { api, type NeedResult } from '../api'
import { fmt, sleep } from '../format'
import { Mark } from '../components/Logo'
import { ActionBar, Arrow, ErrorNote, Typing } from '../components/ui'

function Ai({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`msg ai fade${wide ? ' wide' : ''}`}>
      <span className="av">
        <Mark />
      </span>
      <div className="b">{children}</div>
    </div>
  )
}

const Wheat = () => (
  <span className="tile">
    <svg viewBox="0 0 24 24">
      <rect x="11" y="9" width="2" height="13" rx="1" />
      <ellipse cx="12" cy="4.6" rx="2.2" ry="3.2" />
      <ellipse cx="8.8" cy="9.4" rx="2.2" ry="3.4" transform="rotate(-35 8.8 9.4)" />
      <ellipse cx="15.2" cy="9.4" rx="2.2" ry="3.4" transform="rotate(35 15.2 9.4)" />
      <ellipse cx="8.8" cy="15" rx="2.2" ry="3.4" transform="rotate(-35 8.8 15)" />
      <ellipse cx="15.2" cy="15" rx="2.2" ry="3.4" transform="rotate(35 15.2 15)" />
    </svg>
  </span>
)

/** Шаг 1: заявка своими словами -> заявка на языке биржи и подходящий пул. */
export function Need({
  text,
  bizName,
  result,
  onResult,
  onEdit,
  onShowPool,
}: {
  text: string
  bizName: string
  result: NeedResult | null
  onResult: (r: NeedResult) => void
  onEdit: () => void
  onShowPool: () => void
}) {
  // Сколько сообщений ИИ уже показано: 0 — печатает, 1 — «понял», 2 — заявка, 3 — пул.
  const [shown, setShown] = useState(result ? 3 : 0)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (result) return
    let alive = true
    setError(null)
    const started = Date.now()
    api
      .need(text)
      .then(async (r) => {
        // Пауза «печатает» не короче, чем в макете: ответ кода приходит мгновенно.
        await sleep(Math.max(0, 1100 - (Date.now() - started)))
        if (!alive) return
        onResult(r)
        setShown(1)
        await sleep(350)
        if (alive) setShown(2)
        await sleep(500)
        if (alive) setShown(3)
      })
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, attempt])

  const s = result?.spec
  const pool = result?.pool
  const ok = !!(result && pool && result.missing.length === 0)

  return (
    <section className="scr" aria-labelledby="h-need">
      <h1 className="sr" id="h-need">
        Заявка
      </h1>
      <div className="chat" aria-live="polite">
        <Ai>
          <span className="who">ИИ-агент</span>Assalomu alaykum! Что нужно вашему бизнесу? Можно на узбекском или русском, текстом или голосом.
        </Ai>
        <div className="msg me fade">
          <div className="b">
            <span className="who">{bizName}</span>
            {text}
          </div>
        </div>
        {error && <ErrorNote error={error} onRetry={() => setAttempt((a) => a + 1)} />}
        {!error && shown === 0 && (
          <Ai>
            <Typing />
          </Ai>
        )}
        {shown >= 1 && result && (
          <Ai>
            <span className="who">ИИ-агент</span>
            {result.missing.includes('product')
              ? 'Не нашел такой товар в каталоге биржи. В демо есть мука: напишите, например, «2 т муки в Самарканд».'
              : result.missing.includes('qty_t')
                ? 'Понял товар, но не понял объем. Сколько нужно: например, 2 т или 500 кг?'
                : 'Понял. Вот как это выглядит на языке биржи:'}
          </Ai>
        )}
        {shown >= 2 && s && s.product && s.qty_t && (
          <Ai wide>
            <div className="spec-head">
              <Wheat />
              <h2>Заявка-потребность</h2>
            </div>
            <dl className="spec" style={{ marginTop: 12 }}>
              <dt>Товар</dt>
              <dd>{s.product}</dd>
              <dt>Объём</dt>
              <dd>{String(s.qty_t).replace('.', ',')} т, разовая закупка</dd>
              <dt>Доставка</dt>
              <dd>
                {s.hub}
                {s.city_from_profile && <span className="muted"> · город из профиля</span>}
              </dd>
              <dt>Нужно до</dt>
              <dd>
                {s.due_text}
                {!s.due_given && <span className="muted"> · по вашему обычному запасу</span>}
              </dd>
              <dt>Бюджет</dt>
              <dd>до {fmt(s.budget_uzs)} сум/кг, по вашей истории закупок</dd>
            </dl>
            {result.source === 'template' && <p className="src" style={{ marginTop: 10 }}>Разобрано правилами без ИИ: Claude сейчас недоступен</p>}
          </Ai>
        )}
        {shown >= 3 && result && s?.product && s.qty_t && (
          <Ai>
            <span className="who">ИИ-агент</span>
            {!pool
              ? `Открытого пула с такой потребностью в городе ${s.city} сейчас нет. Измените заявку или попробуйте позже.`
              : pool.joined
                ? 'Вы уже в пуле с этой потребностью. Показать, как идут дела?'
                : s.qty_t < pool.lot_t
                  ? `Один ${pool.lot_unit} на бирже — ${pool.lot_t} т, вам столько не нужно. Но я нашёл пул из ${pool.members} покупателей с той же потребностью. Это разовая закупка: пул собирается под одну поставку и закрывается после неё. Присоединиться?`
                  : `Я нашёл пул из ${pool.members} покупателей с той же потребностью. Это разовая закупка: пул собирается под одну поставку и закрывается после неё. Присоединиться?`}
          </Ai>
        )}
      </div>
      {(shown >= 3 || error) && (
        <ActionBar>
          {ok && (
            <button className="btn" type="button" onClick={onShowPool}>
              Всё верно, показать пул <Arrow />
            </button>
          )}
          <button className={`btn ${ok ? 'ghost' : ''}`} type="button" onClick={onEdit}>
            Изменить
          </button>
        </ActionBar>
      )}
    </section>
  )
}
