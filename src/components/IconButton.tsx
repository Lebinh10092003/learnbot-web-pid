import type { ReactNode } from 'react'

export function IconButton({ children, label, active = false, onClick }: { children: ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button className={`icon-button ${active ? 'active' : ''}`} title={label} aria-label={label} onClick={onClick}>
      {children}
    </button>
  )
}
