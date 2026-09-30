import { Circle } from 'lucide-react'
export function DeviceStatus({ connected }: { connected: boolean }) { return <span className={`device-status ${connected ? 'online' : ''}`}><Circle fill="currentColor" />{connected ? 'Leanbot đã kết nối' : 'Chưa kết nối'}</span> }
