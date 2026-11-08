import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Auction as AuctionT, type Deal as DealT, type Me, type Pool as PoolT } from './api'
import { Logo, LogoSymbols } from './components/Logo'
import { Check, Cross } from './components/ui'
import { readDrafts, readSession, saveDraft, writeDrafts, writeSession, type Draft } from './drafts'
import { reduceMotion } from './format'
import { Auction } from './screens/Auction'
import { Deal } from './screens/Deal'
import { Dispute } from './screens/Dispute'
import { Intro } from './screens/Intro'
import { Need, type NeedRound } from './screens/Need'
import { Pool } from './screens/Pool'

type Step = 'need' | 'pool' | 'auction' | 'deal' | 'reg'
const ORDER: Step[] = ['need', 'pool', 'auction', 'deal', 'reg']
const RAIL: { id: Step; title: string }[] = [
  { id: 'need', title: 'Заявка' },
  { id: 'pool', title: 'Пул и задаток' },
  { id: 'auction', title: 'Торги' },
  { id: 'deal', title: 'Сделка' },
]
const NAMES: Record<Step, string> = { need: 'Заявка', pool: 'Пул и задаток', auction: 'Торги', deal: 'Сделка', reg: 'Спор' }

const hashStep = (): Step | null => {
  const h = location.hash.slice(1) as Step
  return ORDER.includes(h) ? h : null
}

export function App() {
  const session = useRef(readSession())
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState(false)
  const [step, setStep] = useState<Step | null>(() => (session.current ? hashStep() : null))
  const [done, setDone] = useState<Partial<Record<Step, boolean>>>({})
  const [text, setText] = useState(session.current?.text ?? '')
  const [composerText, setComposerText] = useState('')
  const [rounds, setRounds] = useState<NeedRound[]>(() => (session.current?.text ? [{ turn: { text: session.current.text, asked: null }, reply: null }] : []))
  const [poolId, setPoolId] = useState<string | null>(session.current?.poolId ?? null)
  const [qty, setQty] = useState(session.current?.qty ?? 2)
  const [pool, setPool] = useState<PoolT | null>(null)
  const [auction, setAuction] = useState<AuctionT | null>(null)
  const [played, setPlayed] = useState(false)
  const [dealId, setDealId] = useState<string | null>(session.current?.dealId ?? null)
  const [deal, setDeal] = useState<DealT | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>(readDrafts)
  const [sideOpen, setSideOpen] = useState(false)
  const menuBtn = useRef<HTMLButtonElement>(null)
  const sideRef = useRef<HTMLElement>(null)
  // Цена вопроса для карточки рейтинга: задаток до сделки.
  const depositBefore = useRef<number | null>(null)

  const loadMe = useCallback(() => {
    setMeError(false)
    api
      .me()
      .then(setMe)
      .catch(() => setMeError(true))
  }, [])
  useEffect(loadMe, [loadMe])

  useEffect(() => {
    writeSession(text ? { text, poolId, qty, dealId } : null)
  }, [text, poolId, qty, dealId])

  const go = useCallback((id: Step) => {
    setStep(id)
    setSideOpen(false)
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id)
    window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' })
  }, [])

  // Переход по кнопке внутри шага отмечает текущий шаг пройденным, как в макете.
  const advance = (to: Step) => {
    if (step) setDone((d) => ({ ...d, [step]: true }))
    go(to)
  }

  useEffect(() => {
    const onHash = () => {
      const h = hashStep()
      if (h && text) go(h)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [go, text])

  // Боковая панель на узком экране — выдвижное меню.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sideOpen) {
        setSideOpen(false)
        menuBtn.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sideOpen])
  useEffect(() => {
    if (sideOpen) setTimeout(() => sideRef.current?.querySelector<HTMLElement>('.draft .open, .new')?.focus(), 60)
  }, [sideOpen])

  function clearFlow() {
    setStep(null)
    setDone({})
    setText('')
    setRounds([])
    setPoolId(null)
    setPool(null)
    setAuction(null)
    setPlayed(false)
    setDealId(null)
    setDeal(null)
    depositBefore.current = null
    setSideOpen(false)
    history.replaceState(null, '', location.pathname)
  }

  /** На главную. Начатая заявка остается черновиком в этом браузере. */
  function home() {
    if (text) setDrafts(saveDraft(text, NAMES[step ?? 'need']))
    clearFlow()
    setComposerText('')
  }

  function pickDraft(t: string) {
    if (text) setDrafts(saveDraft(text, NAMES[step ?? 'need']))
    clearFlow()
    setComposerText(t)
  }

  function deleteDraft(t: string) {
    const list = readDrafts().filter((x) => x.t !== t)
    writeDrafts(list)
    setDrafts(list)
  }

  async function resetDemo() {
    try {
      await api.reset()
      clearFlow()
      setComposerText('')
      loadMe()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  function send(t: string) {
    setText(t)
    setRounds([{ turn: { text: t, asked: null }, reply: null }])
    go('need')
  }

  const railStep = step === 'reg' ? 'deal' : step
  const bizName = me?.name ?? 'Вы'

  let screen = null
  if (step === 'need' && rounds.length)
    screen = (
      <Need
        bizName={bizName}
        rounds={rounds}
        onRounds={setRounds}
        onComplete={(r) => {
          if (r.pool?.id !== poolId) setAuction(null)
          // Объем мог поменяться: пул перезагрузится с новой долей. Если вы уже в пуле, доля остается прежней.
          if (r.pool?.id !== poolId || !pool?.you.joined) setPool(null)
          setPoolId(r.pool?.id ?? null)
          if (r.spec.qty_t) setQty(r.spec.qty_t)
        }}
        onShowPool={() => advance('pool')}
      />
    )
  else if (step === 'pool' && poolId)
    screen = (
      <Pool
        poolId={poolId}
        qty={qty}
        pool={pool}
        onPool={(p) => {
          setPool(p)
          depositBefore.current ??= p.trust.deposit_pct
          if (p.status === 'filled') setDone((d) => ({ ...d, pool: true }))
        }}
        onToAuction={() => advance('auction')}
      />
    )
  else if (step === 'auction' && poolId)
    screen = (
      <Auction
        poolId={poolId}
        data={auction}
        played={played}
        onData={(a) => {
          setAuction(a)
          if (a.deal_id) setDealId(a.deal_id)
        }}
        onPlayed={() => {
          setPlayed(true)
          setDone((d) => ({ ...d, auction: true }))
        }}
        onToDeal={() => advance('deal')}
      />
    )
  else if ((step === 'deal' || step === 'reg') && !dealId)
    screen = (
      <section className="scr">
        <p className="loading">Сделка появится после торгов: сначала соберите пул и дождитесь итога.</p>
      </section>
    )
  else if (step === 'deal' && dealId)
    screen = (
      <Deal
        dealId={dealId}
        deal={deal}
        prevDepositPct={depositBefore.current}
        onDeal={(d) => {
          setDeal(d)
          if (d.status === 'settled') {
            setDone((x) => ({ ...x, deal: true }))
            loadMe()
          }
        }}
        onDispute={() => go('reg')}
      />
    )
  else if (step === 'reg' && dealId)
    screen = (
      <Dispute
        dealId={dealId}
        onDeal={(d) => {
          setDeal(d)
          if (d.status === 'settled') {
            setDone((x) => ({ ...x, deal: true }))
            loadMe()
          }
        }}
        onBack={() => go('deal')}
      />
    )

  const started = !!step && !!text

  return (
    <>
      <LogoSymbols />
      <div className="app">
        <aside className={`side${sideOpen ? ' open' : ''}`} id="side" ref={sideRef} aria-label="Заявки и черновики">
          <a className="home" href="#" aria-label="Davra, на главную" onClick={(e) => (e.preventDefault(), home())}>
            <Logo width={112} height={28} />
          </a>
          <button className="btn sm new" type="button" onClick={home}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Новая заявка
          </button>
          <div className="drafts">
            <div className="side-h">
              <span>Черновики</span>
              <span className="num">{drafts.length || ''}</span>
            </div>
            <ul>
              {drafts.map((x) => (
                <li className="draft" key={x.t}>
                  <button className="open" type="button" onClick={() => pickDraft(x.t)}>
                    <span className="t1">{x.t}</span>
                    <span className="t2">
                      {x.s} · {x.at}
                    </span>
                  </button>
                  <button className="del" type="button" aria-label={`Удалить черновик: ${x.t}`} onClick={() => deleteDraft(x.t)}>
                    <Cross />
                  </button>
                </li>
              ))}
            </ul>
            {!drafts.length && <p className="side-empty">Незавершённые заявки сохраняются здесь, когда вы начинаете новую.</p>}
          </div>
          <div className="biz">
            <span className="ava" aria-hidden="true">
              {me?.initials ?? '··'}
            </span>
            <div>
              <b>{me?.name ?? (meError ? 'Сервер не отвечает' : 'Загрузка…')}</b>
              <span>
                {me ? `${me.city} · рейтинг ${me.rating}` : meError ? <button className="retry" type="button" onClick={loadMe}>Повторить</button> : ' '}
              </span>
            </div>
          </div>
          <button className="reset" type="button" onClick={resetDemo} title="Вернуть данные демо к началу">
            Сбросить демо
          </button>
        </aside>
        <button className={`scrim${sideOpen ? ' on' : ''}`} type="button" tabIndex={-1} aria-label="Закрыть меню" onClick={() => setSideOpen(false)} />

        <div className="main">
          <header className="mtop">
            <button
              ref={menuBtn}
              className="icon-btn"
              type="button"
              aria-label={drafts.length ? `Меню и черновики, ${drafts.length}` : 'Меню и черновики'}
              aria-controls="side"
              aria-expanded={sideOpen}
              onClick={() => setSideOpen((o) => !o)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h10" />
              </svg>
              {drafts.length > 0 && <span className="badge num">{drafts.length}</span>}
            </button>
            <a className="home" href="#" aria-label="Davra, на главную" onClick={(e) => (e.preventDefault(), home())}>
              <Logo width={96} height={24} />
            </a>
          </header>
          <div className="shell" lang="ru">
            {!started ? (
              <Intro initial={composerText} drafts={drafts} onSend={send} onPickDraft={pickDraft} onShowDrafts={() => setSideOpen(true)} />
            ) : (
              <>
                <nav className="stepper" aria-label="Шаги сделки">
                  <ol className="rail">
                    {RAIL.map((r, i) => {
                      const reached = ORDER.indexOf(r.id) <= ORDER.indexOf(railStep ?? 'need')
                      return (
                        <li key={r.id} className={reached ? 'reached' : ''}>
                          <button
                            className={`step${done[r.id] ? ' done' : ''}`}
                            type="button"
                            aria-current={r.id === railStep ? 'step' : undefined}
                            onClick={() => go(r.id)}
                          >
                            <span className="n">{done[r.id] ? <Check /> : i + 1}</span>
                            <span className="t">{r.title}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ol>
                </nav>
                <main>
                  <div key={step} className="scr-wrap">
                    {screen}
                  </div>
                </main>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="actbar" id="actbar" hidden>
        <div className="row" id="actbar-row" />
      </div>
    </>
  )
}
