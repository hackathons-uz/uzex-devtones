import { useEffect, useState } from 'react'
import { api } from './api'
import { Icon, Trust, useLoad } from './components/ui'
import { DepositScreen } from './pages/DepositScreen'
import { PoolScreen } from './pages/PoolScreen'
import { SellerScreen } from './pages/SellerScreen'
import { DealScreen, GuaranteeScreen, InsuranceScreen, JournalScreen, SearchScreen } from './pages/StaticScreens'

// Три живые функции — в порядке демо-сценария. Остальное — в меню «Еще».
const LIVE = [
  { id: 'deposit', label: 'Залог', who: 'stroyplus' },
  { id: 'pool', label: 'Пул', who: 'stroyplus' },
  { id: 'seller', label: 'Продавец', who: 'cementprom' },
] as const
const MORE = [
  { id: 'search', label: 'Поиск с ценой до двери' },
  { id: 'guarantee', label: 'Поручительство' },
  { id: 'insurance', label: 'Страховка и фонд' },
  { id: 'deal', label: 'Сделка и эскроу' },
  { id: 'journal', label: 'Журнал решений' },
] as const

function useHash(): [string, (s: string) => void] {
  const read = () => location.hash.replace('#', '') || 'deposit'
  const [h, setH] = useState(read)
  useEffect(() => {
    const on = () => setH(read())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return [h, (s: string) => (location.hash = s)]
}

export function App() {
  const [screen, go] = useHash()
  const [menu, setMenu] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const live = LIVE.findIndex((s) => s.id === screen)
  const who = live >= 0 ? LIVE[live].who : 'stroyplus'
  const acct = useLoad(() => api.participant(who), [who, epoch])

  useEffect(() => {
    scrollTo({ top: 0 })
    setMenu(false)
  }, [screen])

  // Меню закрывается по Escape и по клику снаружи.
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    const onClick = (e: MouseEvent) => !(e.target as HTMLElement).closest('.more') && setMenu(false)
    addEventListener('keydown', onKey)
    addEventListener('mousedown', onClick)
    return () => {
      removeEventListener('keydown', onKey)
      removeEventListener('mousedown', onClick)
    }
  }, [menu])

  const reset = async () => {
    setMenu(false)
    await api.reset()
    setEpoch((e) => e + 1)
    go('deposit')
  }

  const body = (() => {
    switch (screen) {
      case 'pool':
        return <PoolScreen />
      case 'seller':
        return <SellerScreen />
      case 'search':
        return <SearchScreen />
      case 'guarantee':
        return <GuaranteeScreen />
      case 'insurance':
        return <InsuranceScreen />
      case 'deal':
        return <DealScreen />
      case 'journal':
        return <JournalScreen />
      default:
        return <DepositScreen go={go} />
    }
  })()

  return (
    <div className="app">
      <header className="top">
        <div className="logo">
          <span className="logo__mark" aria-hidden="true" />
          <span>Биржа доверия</span>
        </div>
        <nav aria-label="Шаги демо">
          <ol className="steps">
            {LIVE.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`step ${live > i ? 'is-done' : ''}`}
                  aria-current={screen === s.id ? 'step' : undefined}
                  onClick={() => go(s.id)}
                >
                  <span className="step__n">{live > i ? Icon.check : i + 1}</span>
                  <span className="step__l">{s.label}</span>
                </button>
              </li>
            ))}
            <li className="more">
              <button type="button" className="step" aria-expanded={menu} onClick={() => setMenu(!menu)} aria-current={live < 0 ? 'step' : undefined}>
                <span className="step__n">…</span>
                <span className="step__l">Еще</span>
              </button>
              {menu && (
                <div className="more__menu">
                  {MORE.map((m) => (
                    <button key={m.id} type="button" className="more__item" aria-current={screen === m.id ? 'page' : undefined} onClick={() => go(m.id)}>
                      {m.label}
                    </button>
                  ))}
                  <button type="button" className="more__item" onClick={reset}>
                    Сбросить демо
                  </button>
                </div>
              )}
            </li>
          </ol>
        </nav>
        {acct.data && (
          <div className="acct">
            <div className="acct__name">
              {acct.data.name}
              <small>
                {acct.data.region} · {acct.data.role === 'seller' ? 'продавец' : 'покупатель'}
              </small>
            </div>
            <span className="acct__lbl">рейтинг</span>
            <Trust r={acct.data.rating} />
          </div>
        )}
      </header>
      <main key={screen + epoch}>{body}</main>
      <footer className="foot">
        Демо для UZEX AI Hackathon. Компании, цены и рейтинги условные. Эскроу, клиринг и доставка — заглушки. ИИ предлагает, правила
        допускают, человек подтверждает.
      </footer>
    </div>
  )
}
