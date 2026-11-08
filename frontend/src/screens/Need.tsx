import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api, type NeedField, type NeedResult, type NeedTurn } from '../api'
import { canRecord, startRecording, type Recording } from '../components/recorder'
import { fmt, sleep } from '../format'
import { Mark } from '../components/Logo'
import { ActionBar, AiWho, Arrow, ErrorNote, Typing } from '../components/ui'

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
  // Вопрос общий сразу обо всем; asked — объем, если он среди недостающих: голое «2» в ответ — это 2 т.
  if (r.missing.length) return r.missing.includes('qty_t') ? 'qty_t' : r.missing[0]
  if (r.pool_late) return 'due'
  return null
}

// Согласие по-русски и по-узбекски: «да», «da», «ha», «ок», «давай», «roziman»…
const YES = /^\s*(да|da|ha|xa|ха|ага|ок|ok|okay|yes|давай|конечно|хорошо|согласен|согласна|верно|всё верно|все верно|mayli|roziman|albatta|xo'p|хоп)[\s!.,)]*$/i

type SpecKey = 'product' | 'vol' | 'hub' | 'date' | 'budget'
const LABELS: Record<SpecKey, string> = { product: 'Товар', vol: 'Объём', hub: 'Доставка', date: 'Нужно до', budget: 'Бюджет' }

/** Поля карточки заявки в формулировках макета. */
function fields(r: NeedResult): Record<SpecKey, string | null> {
  const s = r.spec
  return {
    product: s.product,
    vol: s.qty_t ? `${String(s.qty_t).replace('.', ',')} т, разовая закупка` : null,
    hub: s.hub + (s.city_from_profile ? ' · город из профиля' : ''),
    date: s.due_text ? s.due_text + (s.due_source === 'flexible' ? ' · срок не важен' : '') : null,
    budget: s.budget_uzs !== null ? `до ${fmt(s.budget_uzs)} сум/кг — как вы обычно покупаете` : null,
  }
}

function poolText(r: NeedResult): string {
  const s = r.spec
  const pool = r.pool
  if (!pool) return `Открытого пула с такой потребностью в городе ${s.city} сейчас нет. Напишите, что поменять, или начните новую заявку.`
  if (pool.joined) return 'Вы уже в пуле с этой потребностью. Показать, как идут дела?'
  if (s.qty_t! < pool.lot_t)
    return `На бирже продают целыми ${pool.lot_unit_ins} по ${pool.lot_t} т — одному бизнесу столько не нужно. Я нашёл ${pool.members} ${pool.who}, которым нужно то же самое. Это разовая закупка, после поставки пул закроется. Скинемся на вагон вместе? Напишите «да» — и перейдём к пулу.`
  return `Я нашёл ${pool.members} покупателей, которым нужно то же самое. Это разовая закупка, после поставки пул закроется. Напишите «да» — и перейдём к пулу.`
}

/**
 * Шаг 1: заявка своими словами, обычным чатом. Если чего-то не хватает (товар, объем, срок), агент
 * спрашивает. Любое следующее сообщение уточняет заявку: карточка обновляется на месте, как в макете.
 * Бэкенд разбирает все сообщения вместе, более позднее важнее. Чего не хватает, решает бэкенд.
 */
export function Need({
  bizName,
  rounds,
  onRounds,
  onComplete,
  onShowPool,
}: {
  bizName: string
  rounds: NeedRound[]
  onRounds: (r: NeedRound[]) => void
  onComplete: (r: NeedResult) => void
  onShowPool: () => void
}) {
  const last = rounds[rounds.length - 1]
  const reply = last.reply
  const ask = reply ? nextAsk(reply) : null
  const complete = !!reply && !ask
  const doneIdx = rounds.map((r, i) => (r.reply && !nextAsk(r.reply) ? i : -1)).filter((i) => i >= 0)
  const firstDone = doneIdx[0] ?? -1
  // Сколько частей первого готового ответа показано: 1 — «понял», 2 — карточка, 3 — пул.
  const [shown, setShown] = useState(firstDone >= 0 ? 3 : 0)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [answer, setAnswer] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  // Голос в чате: первое нажатие — запись, второе — распознать в поле. Через 15 с запись останавливается сама.
  const rec = useRef<Recording | null>(null)
  const recTimer = useRef(0)
  const [voice, setVoice] = useState<'idle' | 'rec' | 'parsing'>('idle')
  const [voiceError, setVoiceError] = useState<string | null>(null)

  async function stopVoice() {
    const r = rec.current
    if (!r) return
    rec.current = null
    clearTimeout(recTimer.current)
    setVoice('parsing')
    try {
      const { text } = await api.stt(await r.stop())
      setAnswer((a) => (a ? a + ' ' : '') + text)
      input.current?.focus()
    } catch (e) {
      setVoiceError((e as Error).message)
    } finally {
      setVoice('idle')
    }
  }
  async function toggleVoice() {
    if (voice === 'rec') return stopVoice()
    if (voice !== 'idle') return
    setVoiceError(null)
    try {
      rec.current = await startRecording(() => {})
      setVoice('rec')
      recTimer.current = window.setTimeout(stopVoice, 15000)
    } catch (e) {
      setVoiceError((e as Error).name === 'NotAllowedError' ? 'Нет доступа к микрофону. Разрешите его в браузере или напишите текстом.' : 'Микрофон недоступен. Напишите текстом.')
    }
  }
  useEffect(() => () => rec.current?.cancel(), [])

  useEffect(() => {
    if (reply) return
    let alive = true
    setError(null)
    const isFirst = firstDone < 0
    if (isFirst) setShown(0)
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
        if (!isFirst) return
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
    if (reply) input.current?.focus({ preventScroll: true })
  }, [rounds, shown, reply])

  function sendAnswer() {
    const t = answer.trim()
    if (!t || !reply) return
    setAnswer('')
    // «да» на готовую заявку с пулом — это согласие: сразу к пулу, без нового разбора.
    if (complete && pool && YES.test(t)) return onShowPool()
    // asked — на какой вопрос это ответ; после готовой заявки это просто уточнение.
    onRounds([...rounds, { turn: { text: t, asked: ask }, reply: null }])
  }

  // Карточка одна: стоит на месте первого готового ответа и показывает последнюю версию заявки.
  const latestDone = doneIdx.length ? rounds[doneIdx[doneIdx.length - 1]].reply! : null
  const card = latestDone ? fields(latestDone) : null
  const changed = new Set<SpecKey>()
  if (card && doneIdx.length > 1) {
    const prev = fields(rounds[doneIdx[doneIdx.length - 2]].reply!)
    for (const k of Object.keys(card) as SpecKey[]) if (card[k] !== prev[k]) changed.add(k)
  }
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
          const step = isLast && i === firstDone ? shown : 3
          let update: ReactNode = null
          if (r.reply && !q && i !== firstDone) {
            // Уточнение готовой заявки: что поменялось по сравнению с предыдущей версией.
            const prevReply = rounds[doneIdx[doneIdx.indexOf(i) - 1]].reply!
            const before = fields(prevReply)
            const now = fields(r.reply)
            const diff = (Object.keys(now) as SpecKey[]).filter((k) => now[k] && now[k] !== before[k])
            update = (
              <Ai>
                <AiWho />
                {diff.length ? (
                  <>
                    Обновил заявку:
                    <ul className="chg">
                      {diff.map((k) => (
                        <li key={k}>
                          <span>{LABELS[k]}</span>
                          <b>{k === 'vol' ? now[k]!.split(',')[0] : now[k]}</b>
                        </li>
                      ))}
                    </ul>
                    <span className="small muted">{r.reply.pool?.id === prevReply.pool?.id ? 'Остальное без изменений, пул тот же.' : poolText(r.reply)}</span>
                  </>
                ) : (
                  'Не понял, что поменять. Напишите, например, новый объём или срок.'
                )}
              </Ai>
            )
          }
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
                  <AiWho />
                  {r.reply.pool_late && !r.reply.missing.length
                    ? `Ближайший пул привезёт товар ${r.reply.pool_late.delivery_text}, это позже вашего срока (${r.reply.spec.due_text}). Если можно подождать, напишите новый срок, например «до ${r.reply.pool_late.delivery_text}».`
                    : r.reply.question}
                </Ai>
              )}
              {i === firstDone && card && (
                <>
                  {step >= 1 && (
                    <Ai>
                      <AiWho />
                      Понял! Вот ваша заявка на языке биржи:
                    </Ai>
                  )}
                  {step >= 2 && (
                    <Ai wide>
                      <div className="spec-head">
                        <Wheat />
                        <h2>Ваша заявка</h2>
                      </div>
                      <dl className="spec" style={{ marginTop: 12 }}>
                        {(Object.keys(LABELS) as SpecKey[]).map((k) =>
                          card[k] ? (
                            <div key={k} style={{ display: 'contents' }}>
                              <dt>{LABELS[k]}</dt>
                              {/* key с текстом: поле изменилось — элемент новый, подсветка запускается заново */}
                              <dd key={card[k]} data-k={k} className={changed.has(k) ? 'changed' : undefined}>
                                {card[k]}
                              </dd>
                            </div>
                          ) : null,
                        )}
                      </dl>
                      {latestDone?.source === 'template' && (
                        <p className="src" style={{ marginTop: 10 }}>
                          Разобрано правилами без ИИ: Claude сейчас недоступен
                        </p>
                      )}
                    </Ai>
                  )}
                  {step >= 3 && r.reply && (
                    <Ai>
                      <AiWho />
                      {poolText(r.reply)}
                    </Ai>
                  )}
                </>
              )}
              {update}
              {isLast && !r.reply && !error && (
                <Ai>
                  <Typing />
                </Ai>
              )}
            </div>
          )
        })}
        {error && <ErrorNote error={error} onRetry={() => setAttempt((a) => a + 1)} />}
      </div>

      {reply && (firstDone < 0 || shown >= 3) && (
        <div className="reply-wrap fade">
          <div className="composer reply">
            <textarea
              ref={input}
              rows={1}
              aria-label="Сообщение для Davra"
              maxLength={2000}
              enterKeyHint="send"
              placeholder={voice === 'rec' ? 'Говорите… нажмите микрофон ещё раз, чтобы закончить' : voice === 'parsing' ? 'Распознаю…' : ask ? 'Ваш ответ' : 'Что поменять в заявке?'}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendAnswer()
                }
              }}
            />
            {canRecord() && (
              <button className={`mic${voice === 'rec' ? ' on' : ''}`} type="button" aria-label={voice === 'rec' ? 'Готово, распознать' : 'Сказать голосом'} onClick={toggleVoice} disabled={voice === 'parsing'}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              </button>
            )}
            <button className="send-ic" type="button" aria-label="Отправить" onClick={sendAnswer} disabled={!answer.trim()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
              </svg>
            </button>
          </div>
          {voiceError && <p className="small muted">{voiceError}</p>}
        </div>
      )}
      <div ref={end} />

      <ActionBar>
        {complete && pool && shown >= 3 && (
          <button className="btn fade" type="button" onClick={onShowPool}>
            {pool.joined ? 'К пулу' : 'Да, показать пул'} <Arrow />
          </button>
        )}
      </ActionBar>
    </section>
  )
}
