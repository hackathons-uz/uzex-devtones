import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, type NeedField, type NeedResult, type NeedTurn } from '../api'
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

/** Один круг диалога: сообщение покупателя и ответ агента на все сообщения до него. */
export type NeedRound = { turn: NeedTurn; reply: NeedResult | null }

/** Что спросить дальше. null — заявка полная. Вопрос пишет бэкенд; поздний пул — тоже вопрос о сроке. */
function nextAsk(r: NeedResult): NeedField | null {
  if (r.missing.length) return r.missing[0]
  if (r.pool_late) return 'due'
  return null
}

/**
 * Шаг 1: заявка своими словами. Если чего-то не хватает (товар, объем, срок), агент спрашивает
 * в чате, а покупатель отвечает в поле внизу. Чего не хватает, решает бэкенд.
 */
export function Need({
  bizName,
  rounds,
  onRounds,
  onComplete,
  onEdit,
  onShowPool,
}: {
  bizName: string
  rounds: NeedRound[]
  onRounds: (r: NeedRound[]) => void
  onComplete: (r: NeedResult) => void
  onEdit: () => void
  onShowPool: () => void
}) {
  const last = rounds[rounds.length - 1]
  const reply = last.reply
  const ask = reply ? nextAsk(reply) : null
  const complete = !!reply && !ask
  // Сколько сообщений финального ответа уже показано: 1 — «понял», 2 — заявка, 3 — пул.
  const [shown, setShown] = useState(complete ? 3 : 0)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [answer, setAnswer] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (reply) return
    let alive = true
    setError(null)
    setShown(0)
    const started = Date.now()
    api
      .need(rounds.map((r) => r.turn))
      .then(async (r) => {
        // Пауза «печатает» не короче, чем в макете: ответ правил приходит мгновенно.
        await sleep(Math.max(0, 1100 - (Date.now() - started)))
        if (!alive) return
        onRounds([...rounds.slice(0, -1), { ...last, reply: r }])
        if (nextAsk(r)) return
        onComplete(r)
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
  }, [rounds.length, attempt])

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    if (ask) input.current?.focus({ preventScroll: true })
  }, [rounds, shown, ask])

  function sendAnswer() {
    const t = answer.trim()
    if (!t || !ask) return
    setAnswer('')
    onRounds([...rounds, { turn: { text: t, asked: ask }, reply: null }])
  }

  const s = reply?.spec
  const pool = reply?.pool

  return (
    <section className="scr" aria-labelledby="h-need">
      <h1 className="sr" id="h-need">
        Заявка
      </h1>
      <div className="chat" aria-live="polite">
        {rounds.map((r, i) => {
          const isLast = i === rounds.length - 1
          const q = r.reply && nextAsk(r.reply)
          return (
            <div key={i} className="chat">
              <div className="msg me fade">
                <div className="b">
                  <span className="who">{bizName}</span>
                  {r.turn.text}
                </div>
              </div>
              {r.reply && q && (
                <Ai>
                  <span className="who">ИИ-агент</span>
                  {r.reply.pool_late && !r.reply.missing.length
                    ? `Ближайший пул привезёт товар ${r.reply.pool_late.delivery_text}, это позже вашего срока (${r.reply.spec.due_text}). Если можно подождать, напишите новый срок, например «до ${r.reply.pool_late.delivery_text}».`
                    : r.reply.question}
                </Ai>
              )}
              {isLast && !r.reply && !error && (
                <Ai>
                  <Typing />
                </Ai>
              )}
            </div>
          )
        })}
        {error && <ErrorNote error={error} onRetry={() => setAttempt((a) => a + 1)} />}
        {complete && shown >= 1 && (
          <Ai>
            <span className="who">ИИ-агент</span>Понял. Вот как это выглядит на языке биржи:
          </Ai>
        )}
        {complete && shown >= 2 && s && (
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
                {s.due_source === 'flexible' && <span className="muted"> · срок не важен, ближайшая поставка</span>}
              </dd>
              <dt>Бюджет</dt>
              <dd>до {fmt(s.budget_uzs)} сум/кг, по вашей истории закупок</dd>
            </dl>
            {reply?.source === 'template' && (
              <p className="src" style={{ marginTop: 10 }}>
                Разобрано правилами без ИИ: Claude сейчас недоступен
              </p>
            )}
          </Ai>
        )}
        {complete && shown >= 3 && s && (
          <Ai>
            <span className="who">ИИ-агент</span>
            {!pool
              ? `Открытого пула с такой потребностью в городе ${s.city} сейчас нет. Измените заявку или попробуйте позже.`
              : pool.joined
                ? 'Вы уже в пуле с этой потребностью. Показать, как идут дела?'
                : `${s.qty_t! < pool.lot_t ? `Один ${pool.lot_unit} на бирже — ${pool.lot_t} т, вам столько не нужно. Но я` : 'Я'} нашёл пул из ${pool.members} покупателей с той же потребностью. Это разовая закупка: пул собирается под одну поставку и закрывается после неё. Присоединиться?`}
          </Ai>
        )}
        <div ref={end} />
      </div>

      {ask && !error && (
        <ActionBar>
          <div className="composer reply">
            <textarea
              ref={input}
              rows={1}
              aria-label="Ответ агенту"
              enterKeyHint="send"
              placeholder="Ваш ответ"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendAnswer()
                }
              }}
            />
            <button className="btn sm" type="button" onClick={sendAnswer} disabled={!answer.trim()}>
              Ответить <Arrow />
            </button>
          </div>
        </ActionBar>
      )}
      {((complete && shown >= 3) || error) && (
        <ActionBar>
          {complete && pool && (
            <button className="btn" type="button" onClick={onShowPool}>
              Всё верно, показать пул <Arrow />
            </button>
          )}
          <button className={`btn ${complete && pool ? 'ghost' : ''}`} type="button" onClick={onEdit}>
            Изменить
          </button>
        </ActionBar>
      )}
    </section>
  )
}
