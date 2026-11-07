import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Explanation } from '../api'

export const Icon = {
  arrow: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  check: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5 9-10" />
    </svg>
  ),
  cross: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  truck: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </svg>
  ),
  pin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  ),
  cal: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  ),
  box: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" />
    </svg>
  ),
}

export function Button(props: {
  children: ReactNode
  onClick?: () => void
  icon?: boolean
  ghost?: boolean
  disabled?: boolean
  busy?: boolean
}) {
  return (
    <button
      type="button"
      className={`btn ${props.ghost ? 'btn--ghost' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled || props.busy}
      aria-busy={props.busy || undefined}
    >
      <span className="btn__label">
        <span className="btn__text">{props.busy ? 'Секунду…' : props.children}</span>
      </span>
      {props.icon && <span className="btn__icon">{Icon.arrow}</span>}
    </button>
  )
}

export function Segmented<T extends string | number>(props: {
  label: string
  value: T
  options: { value: T; label: ReactNode; disabled?: boolean }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg-c" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          className="seg-c__item"
          aria-checked={o.value === props.value}
          disabled={o.disabled}
          style={o.disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          onClick={() => !o.disabled && props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Уровень бейджа — только цвет для показа; само число рейтинга приходит с бэкенда.
export function Trust({ r, word }: { r: number; word?: string }) {
  const lvl = r >= 75 ? 'high' : r >= 55 ? 'mid' : 'low'
  return (
    <span className={`trust trust--${lvl}`} title="Рейтинг доверия">
      <span className="trust__s">{r}</span>
      {word}
    </span>
  )
}

/** Текст ИИ появляется по словам, как в макете. */
export function Reveal({ text }: { text: string }) {
  const words = text.split(/(\s+)/)
  let i = 0
  return (
    <>
      {words.map((w, k) =>
        /^\s+$/.test(w) ? (
          w
        ) : (
          <span key={`${text.length}-${k}`} className="word" style={{ ['--d' as string]: `${Math.min(i++ * 28, 560)}ms` }}>
            {w}
          </span>
        ),
      )}
    </>
  )
}

const SOURCE_TEXT = {
  explain: { ai: 'Текст написал ИИ по цифрам из формул', other: 'Текст собран по шаблону: ИИ недоступен, цифры те же' },
  rule: { ai: 'ИИ разобрал текст. Правило начнет действовать после вашего подтверждения', other: 'ИИ недоступен: условия заполняются вручную' },
}

export function SourceLabel({ e, kind = 'explain' }: { e: Explanation | { source: string }; kind?: keyof typeof SOURCE_TEXT }) {
  const ai = e.source === 'ai'
  return (
    <span className={`src ${ai ? 'src--ai' : ''}`}>
      <span className="src__dot" aria-hidden="true" />
      {ai ? SOURCE_TEXT[kind].ai : SOURCE_TEXT[kind].other}
    </span>
  )
}

export function AiCard(props: { tag: string; thinking?: boolean; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`card card--ai ${props.className ?? ''}`} aria-live="polite">
      <span className={`ai ${props.thinking ? 'ai--thinking' : ''}`}>
        <span className="ai__dot" />
        {props.tag}
      </span>
      {props.title && <p className="ai-title">{props.title}</p>}
      {props.children}
    </div>
  )
}

export function Scale({ pct, max = 15 }: { pct: number; max?: number }) {
  // Положение метки на шкале 15% → 0%: чистое отображение числа от бэкенда.
  const p = Math.max(0, Math.min(100, ((max - pct) / max) * 100))
  return (
    <>
      <div className="scale" style={{ ['--p' as string]: `${p}%` }} role="img" aria-label={`Залог ${pct}% из возможных ${max}%`}>
        <span className="scale__fill" />
        <span className="scale__pin" />
      </div>
      <div className="scale__ends">
        <span>15% — после срывов</span>
        <span>1% — рейтинг 90+</span>
      </div>
    </>
  )
}

export function PoolBar({ segments, total, big }: { segments: { id: string; t: number; kind: 'you' | 'ok' | 'wait' }[]; total: number; big?: boolean }) {
  const used = segments.reduce((a, s) => a + s.t, 0)
  const free = Math.max(0, total - used)
  return (
    <div className={`bar ${big ? 'bar--big' : ''}`} role="img" aria-label={`Собрано ${used} из ${total} т`}>
      {segments.map((s) => (
        <span
          key={s.id}
          className={`seg ${s.kind === 'you' ? 'seg--you' : ''}`}
          style={{ ['--t' as string]: s.t, ...(s.kind === 'wait' ? { background: 'var(--stone)' } : {}) }}
        />
      ))}
      {free > 0 && <span className="seg seg--free" style={{ ['--t' as string]: free }} />}
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <div className="error" role="alert">
      {msg}
    </div>
  )
}

/** Загрузка данных с повтором по ключу. Ошибка видна, без тихих подстановок. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  const run = () => {
    const my = ++seq.current
    setLoading(true)
    setError(null)
    fn()
      .then((d) => my === seq.current && setData(d))
      .catch((e) => my === seq.current && setError(e))
      .finally(() => my === seq.current && setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, deps)
  return { data, error, loading, reload: run, setData }
}
