import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { api, type Auction as AuctionT, type Deal as DealT, type Me, type Offer, type Pool as PoolT } from './api'
import { Logo, LogoSymbols } from './components/Logo'
import { Check, Cross, Dr } from './components/ui'
import { reduceMotion } from './format'
import { setLang as applyLang, type Lang } from './i18n'
import { Auction } from './screens/Auction'
import { Deal } from './screens/Deal'
import { Dispute } from './screens/Dispute'
import { Intro } from './screens/Intro'
import { Need } from './screens/Need'
import { Pool } from './screens/Pool'
import { deleteThread, newThread, readOpenId, readThreads, saveThread, stageOf, todoOf, writeOpenId, type Step, type Thread } from './threads'

const ORDER: Step[] = ['need', 'pool', 'auction', 'deal', 'reg']
const RAIL: { id: Step; title: string }[] = [
  { id: 'need', title: 'Заявка' },
  { id: 'pool', title: 'Пул и задаток' },
  { id: 'auction', title: 'Торги' },
  { id: 'deal', title: 'Сделка' },
]

type Theme = 'light' | 'dark'

// Настройки этого браузера: тема и язык. Хранилище может быть недоступно — тогда по умолчанию.
function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* без хранилища настройка не запомнится */
  }
}

const systemTheme = (): Theme => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

// Подсказки к шкалам рейтинга, как в макете.
const TIP = {
  seller: ['Рейтинг продавца: {v} из 5', 'Считается по поставкам без срывов, спорам и срокам. К торгам пулов допускаются продавцы от 4,0, это риска посередине шкалы.'],
  buyer: ['Ваш рейтинг надёжности: {v} из 100', 'Растёт с каждой сделкой без срывов. Чем он выше, тем меньше задаток в пулах.'],
}

export function App() {
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState(false)
  const [threads, setThreads] = useState<Thread[]>(readThreads)
  const [th, setTh] = useState<Thread | null>(() => {
    const id = readOpenId()
    return readThreads().find((x) => x.id === id) ?? null
  })
  const [composerText, setComposerText] = useState('')
  const [pool, setPool] = useState<PoolT | null>(null)
  const [auction, setAuction] = useState<AuctionT | null>(null)
  const [deal, setDeal] = useState<DealT | null>(null)
  const [sideOpen, setSideOpen] = useState(false)
  const [inboxAt, setInboxAt] = useState<{ top: number; left: number } | null>(null)
  const [theme, setTheme] = useState<Theme>(() => (readPref('davra-theme') as Theme | null) ?? systemTheme())
  const [lang, setLang] = useState<Lang>(() => (readPref('davra-lang') === 'uz' ? 'uz' : 'ru'))
  const [rating, setRating] = useState<DealT['rating_change']>(null)
  const [offer, setOffer] = useState<Offer | null>(null)
  const menuBtn = useRef<HTMLButtonElement>(null)
  const sideRef = useRef<HTMLElement>(null)
  const modal = useRef<HTMLDialogElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const dockRow = useRef<HTMLDivElement>(null)
  const [many, setMany] = useState(false)

  const step = th?.step ?? null
  const started = !!th

  // ---------- данные ----------
  const loadMe = useCallback(() => {
    setMeError(false)
    api.me().then(setMe, () => setMeError(true))
  }, [])
  useEffect(loadMe, [loadMe])

  const loadOffer = useCallback(() => {
    let hidden = false
    try {
      hidden = sessionStorage.getItem('davra-offer-hidden') === '1'
    } catch {
      /* без хранилища просто покажем снова */
    }
    if (hidden) return setOffer(null)
    // Предложение — подсказка: если сервер не ответил, главная работает и без него.
    api.offer().then(setOffer, () => setOffer(null))
  }, [])
  useEffect(loadOffer, [loadOffer])
  function dismissOffer() {
    try {
      sessionStorage.setItem('davra-offer-hidden', '1')
    } catch {
      /* ничего */
    }
    setOffer(null)
  }

  /** Изменить открытую заявку и сохранить ее в списке. */
  const patch = useCallback((p: Partial<Thread>) => {
    setTh((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...p }
      setThreads(saveThread(next))
      return next
    })
  }, [])

  // ---------- тема и язык ----------
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    writePref('davra-theme', next)
  }
  useEffect(() => {
    applyLang(lang)
  }, [lang])
  function chooseLang(l: Lang) {
    setLang(l)
    writePref('davra-lang', l)
  }

  // ---------- навигация ----------
  const go = useCallback(
    (id: Step) => {
      patch({ step: id, ...(id === 'auction' ? { auctionSeen: true } : {}) })
      setSideOpen(false)
      if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id)
      window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' })
    },
    [patch],
  )

  useEffect(() => {
    const onHash = () => {
      const h = location.hash.slice(1) as Step
      if (ORDER.includes(h) && th) go(h)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [go, th])

  function resetLocal() {
    setPool(null)
    setAuction(null)
    setDeal(null)
    setSideOpen(false)
    setInboxAt(null)
  }

  function openThread(t: Thread, at?: Step) {
    resetLocal()
    const next = at ? { ...t, step: at } : t
    setTh(next)
    writeOpenId(next.id)
    history.replaceState(null, '', '#' + next.step)
  }

  /** На главную. Заявка остается в списке со своей стадией. */
  function home() {
    resetLocal()
    setTh(null)
    writeOpenId(null)
    setComposerText('')
    history.replaceState(null, '', location.pathname)
    loadOffer()
  }

  function send(text: string) {
    resetLocal()
    const t = newThread(text)
    setTh(t)
    setThreads(saveThread(t))
    writeOpenId(t.id)
    history.replaceState(null, '', '#need')
  }

  function removeThread(id: string) {
    setThreads(deleteThread(id))
    if (th?.id === id) home()
  }

  async function resetDemo() {
    try {
      await api.reset()
      try {
        sessionStorage.removeItem('davra-offer-hidden')
      } catch {
        /* ничего */
      }
      home()
      loadMe()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  // ---------- боковая панель, уведомления, подсказки ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setInboxAt(null)
      if (sideOpen) {
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

  function toggleInbox(e: ReactMouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (inboxAt) return setInboxAt(null)
    const r = e.currentTarget.getBoundingClientRect()
    const w = Math.min(360, innerWidth - 16)
    setInboxAt({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left, innerWidth - w - 8)) })
  }
  useEffect(() => {
    if (!inboxAt) return
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('#inbox')) setInboxAt(null)
    }
    const shut = () => setInboxAt(null)
    document.addEventListener('click', close)
    addEventListener('resize', shut)
    return () => {
      document.removeEventListener('click', close)
      removeEventListener('resize', shut)
    }
  }, [inboxAt])

  // Подсказка к шкале рейтинга: наведение, фокус или касание.
  useEffect(() => {
    let timer = 0
    let current: Element | null = null
    const show = (el: HTMLElement) => {
      const t = tip.current
      if (!t) return
      const [title, text] = TIP[el.dataset.kind === 'seller' ? 'seller' : 'buyer']
      t.innerHTML = ''
      const b = document.createElement('b')
      b.textContent = title.replace('{v}', el.dataset.v ?? '')
      t.append(b, document.createTextNode(text))
      current = el
      const r = el.getBoundingClientRect()
      const w = t.offsetWidth
      const h = t.offsetHeight
      let y = r.top - h - 8
      if (y < 8) y = r.bottom + 8
      t.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)) + 'px'
      t.style.top = y + 'px'
      t.classList.add('on')
    }
    const hide = () => {
      clearTimeout(timer)
      current = null
      tip.current?.classList.remove('on')
    }
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const d = (e.target as Element).closest<HTMLElement>('.dr')
      if (d && d !== current) show(d)
      else if (!d && current) hide()
    }
    const click = (e: MouseEvent) => {
      const d = (e.target as Element).closest<HTMLElement>('.dr')
      if (!d) {
        if (current) hide()
        return
      }
      show(d)
      clearTimeout(timer)
      timer = window.setTimeout(hide, 3500)
    }
    const focus = (e: FocusEvent) => {
      const d = (e.target as Element).closest?.<HTMLElement>('.dr')
      if (d) show(d)
    }
    document.addEventListener('pointerover', over)
    document.addEventListener('click', click)
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', hide)
    addEventListener('scroll', hide, { passive: true })
    return () => {
      document.removeEventListener('pointerover', over)
      document.removeEventListener('click', click)
      document.removeEventListener('focusin', focus)
      document.removeEventListener('focusout', hide)
      removeEventListener('scroll', hide)
    }
  }, [])

  // ---------- нижняя панель: шаги и главная кнопка шага ----------
  useLayoutEffect(() => {
    document.body.classList.toggle('has-bar', started)
  }, [started])
  useEffect(() => {
    const row = dockRow.current
    if (!row) return
    const upd = () => setMany(row.children.length > 1)
    upd()
    const mo = new MutationObserver(upd)
    mo.observe(row, { childList: true })
    return () => mo.disconnect()
  }, [started])

  // ---------- окно «Рейтинг вырос» ----------
  useEffect(() => {
    const dl = modal.current
    if (!dl) return
    if (rating && !dl.open) dl.showModal?.()
    if (!rating && dl.open) dl.close()
  }, [rating])

  function onDeal(d: DealT) {
    setDeal(d)
    patch({ dealStage: d.stage, dealStatus: d.status })
  }
  function onSettled(d: DealT) {
    setRating(d.rating_change)
    loadMe()
  }

  // ---------- экран шага ----------
  const done: Partial<Record<Step, boolean>> = th
    ? {
        need: th.step !== 'need' || th.joined,
        pool: th.filled,
        auction: th.auctionDone,
        deal: th.dealStatus === 'settled',
      }
    : {}
  const railStep = step === 'reg' ? 'deal' : step
  const bizName = me?.name ?? 'Вы'

  let screen = null
  if (th && step === 'need')
    screen = (
      <Need
        bizName={bizName}
        rounds={th.rounds}
        onRounds={(rounds) => patch({ rounds })}
        onComplete={(r) => {
          if (r.pool?.id !== th.poolId) setAuction(null)
          // Объем мог поменяться: пул перезагрузится с новой долей. Если вы уже в пуле, доля остается прежней.
          if (r.pool?.id !== th.poolId || !pool?.you.joined) setPool(null)
          patch({ poolId: r.pool?.id ?? null, qty: r.spec.qty_t ?? th.qty })
        }}
        onShowPool={() => go('pool')}
      />
    )
  else if (th && step === 'pool' && th.poolId)
    screen = (
      <Pool
        poolId={th.poolId}
        qty={th.qty}
        pool={pool}
        onPool={(p) => {
          setPool(p)
          patch({ joined: p.you.joined, filled: p.status === 'filled' })
        }}
        onToAuction={() => go('auction')}
      />
    )
  else if (th && step === 'auction' && th.poolId)
    screen = (
      <Auction
        poolId={th.poolId}
        qty={th.qty}
        data={auction}
        played={th.auctionDone}
        onData={(a) => {
          setAuction(a)
          if (a.deal_id) patch({ dealId: a.deal_id })
        }}
        onPlayed={() => patch({ auctionDone: true })}
        onToDeal={() => go('deal')}
      />
    )
  else if (th && (step === 'deal' || step === 'reg') && !th.dealId)
    screen = (
      <section className="scr">
        <p className="loading">Сделка появится после торгов: сначала соберите пул и дождитесь итога.</p>
      </section>
    )
  else if (th && step === 'deal' && th.dealId)
    screen = <Deal dealId={th.dealId} deal={deal} onDeal={onDeal} onSettled={onSettled} onDispute={() => go('reg')} />
  else if (th && step === 'reg' && th.dealId) screen = <Dispute dealId={th.dealId} onDeal={onDeal} onSettled={onSettled} onBack={() => go('deal')} />
  else if (th)
    screen = (
      <section className="scr">
        <p className="loading">Этот шаг откроется, когда заявка дойдёт до него.</p>
      </section>
    )

  const order = { warn: 0, act: 1, info: 2 }
  const todos = threads
    .map((t) => ({ t, todo: todoOf(t) }))
    .filter((x) => x.todo)
    .sort((a, b) => order[a.todo!.kind] - order[b.todo!.kind])
  const needYou = todos.filter((x) => x.todo!.kind !== 'info').length
  const resume = threads.find((t) => stageOf(t).kind !== 'ok') ?? null

  const bell = (
    <button
      className="bell"
      type="button"
      aria-haspopup="true"
      aria-expanded={!!inboxAt}
      aria-controls="inbox"
      aria-label={needYou ? `Что нужно сделать, ${needYou}` : 'Что нужно сделать'}
      onClick={toggleInbox}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
      </svg>
      {needYou > 0 && <span className="bell-n num">{needYou}</span>}
    </button>
  )
  const themeLabel = theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'
  const themeBtn = (
    <button className="theme-btn" type="button" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
      {theme === 'dark' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  )

  return (
    <>
      <LogoSymbols />
      <div className="app">
        <aside className={`side${sideOpen ? ' open' : ''}`} id="side" ref={sideRef} aria-label="Заявки">
          <div className="side-top">
            <a className="home" href="#" aria-label="Davra, на главную" onClick={(e) => (e.preventDefault(), home())}>
              <Logo width={100} height={25} />
            </a>
            <div className="tools">
              {themeBtn}
              <div className="lang" role="group" aria-label="Язык интерфейса">
                {(['ru', 'uz'] as Lang[]).map((l) => (
                  <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => chooseLang(l)}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button className="btn sm new" type="button" onClick={home}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Новая заявка
          </button>
          <div className="drafts">
            <div className="side-h">
              <span>Заявки</span>
              <span className="num">{threads.length || ''}</span>
            </div>
            <ul>
              {threads.map((x) => {
                const st = stageOf(x)
                return (
                  <li className="draft" key={x.id}>
                    <button className="open" type="button" aria-current={th?.id === x.id ? 'true' : undefined} onClick={() => openThread(x)}>
                      <span className="t1">{x.title}</span>
                      <span className="t2">
                        <span className={`st st-${st.kind}`}>{st.text}</span>
                        <span>{x.at}</span>
                      </span>
                    </button>
                    <span className="go" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </span>
                    <button className="del" type="button" aria-label={`Удалить заявку: ${x.title}`} onClick={() => removeThread(x.id)}>
                      <Cross />
                    </button>
                  </li>
                )
              })}
            </ul>
            {!threads.length && <p className="side-empty">Здесь будут ваши заявки. Каждая хранит переписку с ИИ и показывает, на каком она этапе.</p>}
          </div>
          <div className="biz">
            <span className="ava" aria-hidden="true">
              {me?.initials ?? '··'}
            </span>
            <div>
              <b>{me?.name ?? (meError ? 'Сервер не отвечает' : 'Загрузка…')}</b>
              <span className="loc">
                {me ? (
                  <>
                    {me.city} <Dr value={me.rating} kind="buyer" />
                  </>
                ) : meError ? (
                  <button className="retry" type="button" onClick={loadMe}>
                    Повторить
                  </button>
                ) : (
                  ' '
                )}
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
              aria-label={threads.length ? `Меню и заявки, ${threads.length}` : 'Меню и заявки'}
              aria-controls="side"
              aria-expanded={sideOpen}
              onClick={() => setSideOpen((o) => !o)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h10" />
              </svg>
              {threads.length > 0 && <span className="badge num">{threads.length}</span>}
            </button>
            <a className="home" href="#" aria-label="Davra, на главную" onClick={(e) => (e.preventDefault(), home())}>
              <Logo width={96} height={24} />
            </a>
            <span style={{ flex: 1 }} />
            {themeBtn}
            {bell}
          </header>
          <div className="shell" lang={lang}>
            {!th ? (
              <Intro
                initial={composerText}
                offer={offer}
                onDismissOffer={dismissOffer}
                resume={resume && { title: resume.title, stage: stageOf(resume) }}
                count={threads.length}
                onSend={send}
                onResume={() => resume && openThread(resume)}
                onShowAll={() => setSideOpen(true)}
              />
            ) : (
              <main>
                <div key={`${th.id}-${step}`} className="scr-wrap">
                  {screen}
                </div>
              </main>
            )}
          </div>
        </div>
      </div>

      <div className="tip" ref={tip} id="tip" role="tooltip" />
      {inboxAt && (
        <div className="inbox" id="inbox" role="dialog" aria-label="Что нужно сделать" style={{ top: inboxAt.top, left: inboxAt.left }}>
          <div className="inbox-h">
            <b>Что нужно сделать</b>
            <span className="small muted">{needYou ? `Ждут вас: ${needYou}` : ''}</span>
          </div>
          <ul>
            {todos.map(({ t, todo }) => (
              <li key={t.id} className={todo!.kind}>
                <button type="button" onClick={() => openThread(t, todo!.step)}>
                  <span className="dot" aria-hidden="true" />
                  <span className="tx">
                    <b>{todo!.title}</b>
                    <span>{todo!.text}</span>
                    <i>{t.title}</i>
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          {!todos.length && <p className="inbox-empty small muted">Всё сделано. Когда по заявке понадобится ваше действие, оно появится здесь.</p>}
        </div>
      )}

      <dialog className="modal" ref={modal} aria-labelledby="rc-t" onClose={() => setRating(null)} onClick={(e) => e.target === modal.current && setRating(null)}>
        <span className="modal-ic" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        {rating && (
          <>
            <h2 id="rc-t">{rating.after > rating.before ? `Рейтинг вырос до ${rating.after}` : `Рейтинг ${rating.after}`}</h2>
            <p>Отличная работа! Сделка прошла без срывов, поэтому задаток в следующих пулах теперь {String(rating.next_deposit_pct).replace('.', ',')}%.</p>
          </>
        )}
        <button className="btn" type="button" onClick={() => setRating(null)}>
          Понятно
        </button>
      </dialog>

      <div className="actbar" id="actbar" hidden={!started}>
        <div className={`dock${many ? ' many' : ''}`}>
          <nav className="stepper" aria-label="Шаги сделки">
            <ol className="rail">
              {RAIL.map((r, i) => {
                const reached = ORDER.indexOf(r.id) <= ORDER.indexOf(railStep ?? 'need')
                return (
                  <li key={r.id} className={reached ? 'reached' : ''}>
                    <button className={`step${done[r.id] ? ' done' : ''}`} type="button" aria-current={r.id === railStep ? 'step' : undefined} onClick={() => go(r.id)}>
                      <span className="n">{done[r.id] ? <Check /> : i + 1}</span>
                      <span className="t">{r.title}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>
          <div className="row" id="actbar-row" ref={dockRow} />
        </div>
      </div>
    </>
  )
}
