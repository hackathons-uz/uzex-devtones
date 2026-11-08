// Заявки-треды, как в макете: у каждой своя переписка и стадия. Хранятся только в этом браузере.
// Хранилище может быть недоступно (приватный режим) — тогда треды просто не сохраняются.
import type { NeedRound } from './screens/Need'

export type Step = 'need' | 'pool' | 'auction' | 'deal' | 'reg'

export type Thread = {
  id: string
  title: string
  rounds: NeedRound[]
  step: Step
  poolId: string | null
  qty: number
  dealId: string | null
  // Что уже случилось: по этому считаются стадия в списке и пункт в «Что нужно сделать».
  joined: boolean
  filled: boolean
  auctionSeen: boolean
  auctionDone: boolean
  dealStage: number
  dealStatus: 'active' | 'dispute' | 'arbiter' | 'settled' | null
  at: string
}

const KEY = 'davra-threads'
const OPEN = 'davra-open'
const MAX = 12

export function newThread(title: string): Thread {
  return {
    id: Date.now().toString(36),
    title,
    rounds: [{ turn: { text: title, asked: null }, reply: null }],
    step: 'need',
    poolId: null,
    qty: 2,
    dealId: null,
    joined: false,
    filled: false,
    auctionSeen: false,
    auctionDone: false,
    dealStage: 0,
    dealStatus: null,
    at: '',
  }
}

export function readThreads(): Thread[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function write(list: Thread[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* хранилище недоступно: тред не сохранится */
  }
}

/** Сохранить тред наверх списка и вернуть новый список. */
export function saveThread(t: Thread): Thread[] {
  const d = new Date()
  const saved = { ...t, at: `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}` }
  const list = [saved, ...readThreads().filter((x) => x.id !== t.id)]
  write(list)
  return list.slice(0, MAX)
}

export function deleteThread(id: string): Thread[] {
  const list = readThreads().filter((x) => x.id !== id)
  write(list)
  return list
}

export function readOpenId(): string | null {
  try {
    return sessionStorage.getItem(OPEN)
  } catch {
    return null
  }
}

export function writeOpenId(id: string | null) {
  try {
    if (id) sessionStorage.setItem(OPEN, id)
    else sessionStorage.removeItem(OPEN)
  } catch {
    /* без сессии перезагрузка вернет на главную */
  }
}

export type Stage = { text: string; kind: 'idle' | 'act' | 'warn' | 'ok' }

/** Стадия заявки по тому, что в ней реально случилось. */
export function stageOf(t: Thread): Stage {
  if (t.dealStatus === 'dispute' || t.dealStatus === 'arbiter') return { text: 'Спор', kind: 'warn' }
  if (t.dealStatus === 'settled') return { text: 'Завершена', kind: 'ok' }
  if (t.dealStage >= 3) return { text: 'Доставка', kind: 'act' }
  if (t.auctionDone) return { text: 'Оплата', kind: 'act' }
  if (t.auctionSeen) return { text: 'Торги', kind: 'act' }
  if (t.filled) return { text: 'Пул собран', kind: 'act' }
  return { text: 'Заявка', kind: 'idle' }
}
