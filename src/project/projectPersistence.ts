import type { LeanbotProject } from './projectStore'

const PROJECT_KEY = 'leanbot-studio.project.v2'
const RECOVERY_KEY = 'leanbot-studio.project.recovery'

interface Envelope { version: 2; savedAt: number; project: LeanbotProject }

export function saveProject(project: LeanbotProject, storage: Storage = localStorage) {
  try {
    storage.setItem(PROJECT_KEY, JSON.stringify({ version: 2, savedAt: Date.now(), project } satisfies Envelope))
    return true
  } catch { return false }
}

export function loadProject(storage: Storage = localStorage): LeanbotProject | null {
  const raw = storage.getItem(PROJECT_KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<Envelope>
    if (value.version !== 2 || !value.project?.cppSource || !value.project?.blockWorkspace) throw new Error('invalid project')
    return value.project
  } catch {
    try { storage.setItem(RECOVERY_KEY, raw) } catch {}
    return null
  }
}

export function bindProjectPersistence(getProject: () => LeanbotProject, onFailure?: () => void) {
  let timer = 0
  const flush = () => { window.clearTimeout(timer); if (!saveProject(getProject())) onFailure?.() }
  const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(flush, 350) }
  const keydown = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); flush() } }
  const visibility = () => { if (document.visibilityState === 'hidden') flush() }
  window.addEventListener('keydown', keydown); window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', visibility)
  return { schedule, flush, dispose: () => { window.clearTimeout(timer); window.removeEventListener('keydown', keydown); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', visibility) } }
}
