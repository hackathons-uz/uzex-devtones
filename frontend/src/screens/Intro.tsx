import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { canRecord, startRecording, type Recording } from '../components/recorder'
import { reduceMotion } from '../format'
import { Arrow, Cross, Check } from '../components/ui'
import type { Draft } from '../drafts'

const EXAMPLES = ['2 т муки в/с в Самарканд', 'Мука для пекарни, 2 т', '2 тонны муки до 25 ноября']
const MAX_REC_S = 15

export function Intro({
  initial,
  drafts,
  onSend,
  onPickDraft,
  onShowDrafts,
}: {
  initial: string
  drafts: Draft[]
  onSend: (text: string) => void
  onPickDraft: (t: string) => void
  onShowDrafts: () => void
}) {
  const [value, setValue] = useState(initial)
  const [exI, setExI] = useState(0)
  const [phOut, setPhOut] = useState(false)
  const [rec, setRec] = useState<null | { start: number; secs: number }>(null)
  const [parsing, setParsing] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const recording = useRef<Recording | null>(null)
  const levels = useRef<number[]>([])
  const bars = useRef<HTMLSpanElement>(null)

  useEffect(() => setValue(initial), [initial])

  const fit = () => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }
  useEffect(fit, [value])
  useEffect(() => {
    input.current?.focus({ preventScroll: true })
    document.fonts?.ready.then(fit)
  }, [])

  // Примеры сменяют друг друга в пустом поле; Enter на пустом поле отправляет показанный.
  useEffect(() => {
    const id = setInterval(() => {
      if (value || rec) return
      setPhOut(true)
      setTimeout(() => {
        setExI((i) => (i + 1) % EXAMPLES.length)
        setPhOut(false)
      }, reduceMotion() ? 0 : 260)
    }, 3200)
    return () => clearInterval(id)
  }, [value, rec])

  // Таймер записи; через 15 секунд запись отправляется сама.
  useEffect(() => {
    if (!rec) return
    const id = setInterval(() => {
      const secs = Math.floor((Date.now() - rec.start) / 1000)
      setRec((r) => (r ? { ...r, secs } : r))
      if (secs >= MAX_REC_S) finishRec()
    }, 200)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec?.start])

  // «Волна» — настоящая громкость с микрофона: новые значения справа, старые уходят влево.
  function onLevel(level: number) {
    const el = bars.current
    if (!el || reduceMotion()) return
    const list = levels.current
    list.push(level)
    if (list.length > el.children.length) list.shift()
    const offset = el.children.length - list.length
    Array.from(el.children).forEach((b, k) => {
      const v = k < offset ? 0 : list[k - offset]
      ;(b as HTMLElement).style.height = Math.round(12 + v * 88) + '%'
    })
  }

  async function startRec() {
    if (rec || parsing) return
    setVoiceError(null)
    levels.current = []
    try {
      recording.current = await startRecording(onLevel)
      setRec({ start: Date.now(), secs: 0 })
    } catch (e) {
      const denied = (e as Error).name === 'NotAllowedError'
      setVoiceError(denied ? 'Нет доступа к микрофону. Разрешите его в браузере или напишите текстом.' : 'Микрофон недоступен. Напишите текстом.')
    }
  }
  async function finishRec() {
    const r = recording.current
    if (!r) return
    recording.current = null
    setRec(null)
    setParsing(true)
    try {
      const audio = await r.stop()
      const { text } = await api.stt(audio)
      setValue(text)
      input.current?.focus()
    } catch (e) {
      setVoiceError((e as Error).message)
    } finally {
      setParsing(false)
    }
  }
  function cancelRec() {
    recording.current?.cancel()
    recording.current = null
    setRec(null)
  }

  function send() {
    const t = value.trim() || (rec || parsing ? '' : EXAMPLES[exI])
    if (t) onSend(t)
  }

  const placeholder = parsing ? 'Распознаю…' : EXAMPLES[exI]
  return (
    <section className="intro" aria-labelledby="h-intro">
      <h1 className="greet" id="h-intro">
        Что нужно вашему бизнесу?
      </h1>
      <div className={`compose-row${rec ? ' recording' : ''}`}>
        <div className={`composer${rec ? ' recording' : ''}${parsing ? ' parsing' : ''}`}>
          <textarea
            ref={input}
            rows={1}
            aria-label="Что нужно вашему бизнесу"
            enterKeyHint="send"
            placeholder={placeholder}
            className={phOut ? 'ph-out' : ''}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Tab' && !value && !e.shiftKey) {
                e.preventDefault()
                setValue(EXAMPLES[exI])
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button className="btn" type="button" onClick={send}>
            Найти решение <Arrow />
          </button>
          {rec && (
            <div className="rec">
              <button className="mic" type="button" aria-label="Отменить запись" onClick={cancelRec}>
                <Cross size={18} />
              </button>
              <span className="rec-dot" aria-hidden="true" />
              <span className="rec-wave" ref={bars} aria-hidden="true">
                {Array.from({ length: 48 }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
              <span className="rec-t num">0:{String(rec.secs).padStart(2, '0')}</span>
              <button className="mic on" type="button" aria-label="Готово, распознать" onClick={finishRec} autoFocus>
                <Check />
              </button>
            </div>
          )}
        </div>
        {canRecord() && (
          <button className="mic mic-solo" type="button" aria-label="Сказать голосом" onClick={startRec}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
        )}
      </div>
      {rec ? (
        <p className="rec-hint">Говорите своими словами, на узбекском или русском</p>
      ) : (
        <p className="intro-hint">{voiceError ?? 'Своими словами, текстом или голосом, на узбекском или русском. Коды товаров знать не нужно.'}</p>
      )}
      {drafts.length > 0 && (
        <div className="resume">
          <button className="open" type="button" onClick={() => onPickDraft(drafts[0].t)}>
            <span className="t2">
              Черновик · {drafts[0].s} · {drafts[0].at}
            </span>
            <span className="t1">{drafts[0].t}</span>
          </button>
          {drafts.length > 1 && (
            <button className="all" type="button" onClick={onShowDrafts}>
              Все {drafts.length}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
