import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { Button } from './button'
export function Toast({ message, tone = 'info', onClose }: { message: string; tone?: 'info' | 'success' | 'error'; onClose(): void }) {
  return <div className={`toast ${tone}`} role="status" aria-live="polite">{tone === 'success' ? <CircleCheck /> : <CircleAlert />}<span>{message}</span><Button variant="ghost" size="icon" onClick={onClose} aria-label="Đóng thông báo"><X /></Button></div>
}
