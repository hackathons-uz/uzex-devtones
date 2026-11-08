import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { reduceMotion } from '../format'

const EASE = 'cubic-bezier(.23,1,.32,1)'

/** Число, которое меняется как в макете: старое уходит вверх, новое приходит снизу. */
export function Roll({ text, small, className }: { text: string; small?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState({ text, small })
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const el = ref.current
    if (!el || reduceMotion() || !el.animate) {
      setShown({ text, small })
      return
    }
    el.getAnimations().forEach((a) => a.cancel())
    const out = el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-30%)', opacity: 0 }], {
      duration: 110,
      easing: 'ease-in',
      fill: 'forwards',
    })
    out.onfinish = () => {
      setShown({ text, small })
      out.cancel()
      el.animate(
        [
          { transform: 'translateY(30%)', opacity: 0, filter: 'blur(2px)' },
          { transform: 'none', opacity: 1, filter: 'blur(0)' },
        ],
        { duration: 240, easing: EASE },
      )
    }
  }, [text, small])
  return (
    <span ref={ref} className={`tick ${className ?? ''}`}>
      {shown.text}
      {shown.small && <small>{shown.small}</small>}
    </span>
  )
}

export function Check() {
  return (
    <svg className="ck" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export function Cross({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export const Arrow = () => <span className="ar">→</span>

/** Главные кнопки шага: уходят в плавающую панель внизу, рядом с шагами. Панель рисует App. */
export function ActionBar({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setHost(document.getElementById('actbar-row'))
  }, [])
  return host ? createPortal(children, host) : null
}

/** Кольцо пула: одна точка — одна тонна. Доли идут в порядке вступления. */
export function Ring({ lot, segments, full }: { lot: number; segments: { you: boolean; qty_t: number }[]; full: boolean }) {
  const cls: string[] = []
  for (const s of segments) for (let i = 0; i < Math.round(s.qty_t); i++) cls.push(s.you ? 'you' : 'on')
  const filled = segments.reduce((a, s) => a + s.qty_t, 0)
  const dots = Array.from({ length: lot }, (_, i) => {
    const ang = ((-90 + (360 / lot) * i) * Math.PI) / 180
    return <circle key={i} cx={(120 + 108 * Math.cos(ang)).toFixed(2)} cy={(120 + 108 * Math.sin(ang)).toFixed(2)} r="4.8" className={cls[i] ?? ''} />
  })
  return (
    <div className={`ring${full ? ' full' : ''}`} role="img" aria-label={`Пул заполнен на ${filled} из ${lot} тонн`}>
      <svg viewBox="0 0 240 240" aria-hidden="true">
        {dots}
      </svg>
      <div className="c">
        <span className="v">{filled}</span>
        <span className="small muted">из {lot} т</span>
      </div>
    </div>
  )
}

/**
 * Рейтинг шкалой с меткой Davra, как в макете. Покупатель — 0..100, продавец — 3,0..5,0;
 * у продавца риска посередине — порог допуска 4,0. Подсказку по наведению показывает App.
 */
export function Dr({ value, kind, lg }: { value: number; kind: 'buyer' | 'seller'; lg?: boolean }) {
  const p = kind === 'buyer' ? value : ((value - 3) / 2) * 100
  const v = kind === 'buyer' ? String(value) : value.toFixed(1).replace('.', ',')
  return (
    <span
      className={`dr${lg ? ' lg' : ''}`}
      tabIndex={0}
      data-v={v}
      data-kind={kind}
      style={{ '--p': `${Math.max(0, Math.min(100, p)).toFixed(1)}%` } as CSSProperties}
      role="img"
      aria-label={`рейтинг ${v} из ${kind === 'buyer' ? 100 : 5}`}
    >
      <span className="dr-track" aria-hidden="true">
        <i className="dr-fill" />
        {kind === 'seller' && <i className="dr-tick" style={{ left: '50%' }} />}
        <span className="dr-thumb">
          <svg viewBox="0 0 512 512">
            <use href="#davra-mark" />
          </svg>
        </span>
      </span>
      {!lg && <b aria-hidden="true">{v}</b>}
    </span>
  )
}

export const AiWho = () => (
  <span className="who">
    Davra <span className="ai-tag">ИИ</span>
  </span>
)

export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="err fade" role="alert">
      <span>{error}</span>
      {onRetry && (
        <button className="btn sm outline" type="button" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  )
}

export function Typing() {
  return (
    <span className="typing" aria-label="ИИ печатает">
      <i />
      <i />
      <i />
    </span>
  )
}
