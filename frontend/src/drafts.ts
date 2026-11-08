// Черновики заявок: только в этом браузере. Хранилище может быть недоступно — тогда просто без черновиков.

export type Draft = { t: string; s: string; at: string }

const KEY = 'davra-drafts'
const MAX = 5

export function readDrafts(): Draft[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function writeDrafts(list: Draft[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* хранилище недоступно: черновик не сохранится */
  }
}

export function saveDraft(text: string, stepName: string): Draft[] {
  const d = new Date()
  const at = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  const list = [{ t: text, s: stepName, at }, ...readDrafts().filter((x) => x.t !== text)]
  writeDrafts(list)
  return list.slice(0, MAX)
}

// Текущий сценарий для перезагрузки страницы на шаге (#pool, #deal): только сессия вкладки.
const SKEY = 'davra-session'
export type SessionState = { text: string; poolId: string | null; qty: number; dealId: string | null }

export function readSession(): SessionState | null {
  try {
    return JSON.parse(sessionStorage.getItem(SKEY) || 'null')
  } catch {
    return null
  }
}

export function writeSession(s: SessionState | null) {
  try {
    if (s) sessionStorage.setItem(SKEY, JSON.stringify(s))
    else sessionStorage.removeItem(SKEY)
  } catch {
    /* без сессии перезагрузка вернет на главную */
  }
}
