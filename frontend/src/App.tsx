import { useEffect, useState, type ReactNode } from 'react'
import { api } from './api'
import { Trust, useLoad } from './components/ui'
import { DepositScreen } from './pages/DepositScreen'
import { PoolScreen } from './pages/PoolScreen'
import { SellerScreen } from './pages/SellerScreen'
import { DealScreen, GuaranteeScreen, InsuranceScreen, JournalScreen, SearchScreen } from './pages/StaticScreens'
import { STUBS, StubScreen } from './pages/StubScreen'

// Иконки меню: простые линии в одном стиле.
const I = (d: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
)
const ICON = {
  deposit: I(<><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h4" /></>),
  pool: I(<><circle cx="8" cy="9" r="3" /><circle cx="16" cy="9" r="3" /><path d="M2.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5M12.5 15.5c.9-.7 2.1-1 3.5-1 2.5 0 4.7 1.5 5.5 4.5" /></>),
  seller: I(<><path d="M4 10l1.5-5h13L20 10M4 10v9h16v-9M4 10h16M9 19v-5h6v5" /></>),
  search: I(<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>),
  guarantee: I(<><path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z" /><path d="M8.8 12l2.2 2.2 4.4-4.4" /></>),
  insurance: I(<><path d="M12 3v2M4 12a8 8 0 0 1 16 0z" /><path d="M12 12v6.5a2 2 0 0 1-4 0" /></>),
  deal: I(<><path d="M4 6h16v12H4z" /><path d="M4 10h16M8 14h3" /><circle cx="17" cy="14.5" r="1.2" /></>),
  journal: I(<><path d="M6 3h11a2 2 0 0 1 2 2v16H8a2 2 0 0 1-2-2z" /><path d="M6 19a2 2 0 0 1 2-2h11M10 8h5M10 11.5h5" /></>),
  auction: I(<><path d="M14 4l6 6M11 7l6 6M12.5 5.5l-6 6 3 3 6-6M8 13l-5 5" /><path d="M13 21h8" /></>),
  logistics: I(<><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>),
  disputes: I(<><path d="M12 4v16M5 8h14M5 8l-2.5 6a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0zM8 20h8" /></>),
  analytics: I(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
  notifications: I(<><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>),
  profile: I(<><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.9-3.6 3.6-5.5 7-5.5s6.1 1.9 7 5.5" /></>),
  reset: I(<><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4.5h4.5" /></>),
}

type Item = { id: keyof typeof ICON; label: string; n?: number; who?: string }
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Демо',
    items: [
      { id: 'deposit', label: 'Залог', n: 1, who: 'stroyplus' },
      { id: 'pool', label: 'Пул', n: 2, who: 'stroyplus' },
      { id: 'seller', label: 'Продавец', n: 3, who: 'cementprom' },
    ],
  },
  {
    title: 'Биржа',
    items: [
      { id: 'search', label: 'Поиск' },
      { id: 'guarantee', label: 'Поручительство' },
      { id: 'insurance', label: 'Страховка' },
      { id: 'deal', label: 'Сделка и эскроу' },
      { id: 'journal', label: 'Журнал решений' },
    ],
  },
  {
    title: 'Скоро',
    items: Object.entries(STUBS).map(([id, s]) => ({ id: id as keyof typeof ICON, label: s.title })),
  },
]
const ALL = GROUPS.flatMap((g) => g.items)

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
  const [epoch, setEpoch] = useState(0)
  const [resetting, setResetting] = useState(false)
  const item = ALL.find((i) => i.id === screen) ?? ALL[0]
  const who = item.who ?? 'stroyplus'
  const acct = useLoad(() => api.participant(who), [who, epoch])

  useEffect(() => {
    scrollTo({ top: 0 })
  }, [screen])

  const reset = async () => {
    setResetting(true)
    try {
      await api.reset()
      setEpoch((e) => e + 1)
      go('deposit')
    } finally {
      setResetting(false)
    }
  }

  const body = (() => {
    if (screen in STUBS) return <StubScreen id={screen} />
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
    <div className="shell">
      <aside className="side" aria-label="Модули биржи">
        <div className="logo side__logo">
          <span className="logo__mark" aria-hidden="true" />
          <span>Биржа доверия</span>
        </div>
        {GROUPS.map((g) => (
          <nav key={g.title} className="side__group" aria-label={g.title}>
            <span className="side__title">{g.title}</span>
            {g.items.map((i) => (
              <a key={i.id} href={`#${i.id}`} className="nav" aria-current={item.id === i.id ? 'page' : undefined}>
                <span className="nav__ic">{ICON[i.id]}</span>
                <span className="nav__l">{i.label}</span>
                {i.n && <span className="nav__n">{i.n}</span>}
              </a>
            ))}
          </nav>
        ))}
        <button type="button" className="nav side__reset" onClick={reset} disabled={resetting}>
          <span className="nav__ic">{ICON.reset}</span>
          <span className="nav__l">{resetting ? 'Сбрасываю…' : 'Сбросить демо'}</span>
        </button>
      </aside>

      <div className="app">
        <header className="top">
          <div className="top__title">
            {item.n ? <span className="top__step">Шаг {item.n} из 3</span> : null}
            <span>{item.label}</span>
          </div>
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
    </div>
  )
}
