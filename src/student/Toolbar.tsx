import { Blocks, Braces, Cable, CircleStop, LocateFixed, Play, Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import type { SourceMode, SyncState } from '../project/projectStore'
import { Button } from '../components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Tooltip } from '../components/ui/tooltip'
import { DeviceStatus } from './DeviceStatus'

export function Toolbar({ mode, syncState, connected, busy, onMode, onUndo, onRedo, onZoomIn, onZoomOut, onCenter, onConnect, onRun, onStop }: { mode: SourceMode; syncState: SyncState; connected: boolean; busy: boolean; onMode(mode: SourceMode): void; onUndo(): void; onRedo(): void; onZoomIn(): void; onZoomOut(): void; onCenter(): void; onConnect(): void; onRun(): void; onStop(): void }) {
  const icon = (label: string, child: React.ReactNode, action: () => void) => <Tooltip label={label}><Button variant="ghost" size="icon" onClick={action} aria-label={label}>{child}</Button></Tooltip>
  return <div className="student-toolbar">
    <Tabs value={mode} onValueChange={(value) => onMode(value as SourceMode)}><TabsList className="mode-tabs" aria-label="Chế độ lập trình"><TabsTrigger value="blocks"><Blocks />Blocks</TabsTrigger><TabsTrigger value="cpp"><Braces />C++</TabsTrigger></TabsList></Tabs>
    <div className="toolbar-separator" />
    <div className="tool-group">{icon('Hoàn tác', <Undo2 />, onUndo)}{icon('Làm lại', <Redo2 />, onRedo)}</div>
    {mode === 'blocks' && <><div className="toolbar-separator" /><div className="tool-group">{icon('Thu nhỏ', <ZoomOut />, onZoomOut)}{icon('Phóng to', <ZoomIn />, onZoomIn)}{icon('Căn giữa', <LocateFixed />, onCenter)}</div></>}
    <span className={`sync-badge ${syncState}`}>{syncState === 'synced' ? 'Đã đồng bộ' : syncState === 'blocks-newer' ? 'Blocks mới hơn' : syncState === 'cpp-newer' ? 'C++ mới hơn' : syncState === 'conflict' ? 'Có xung đột' : 'C++ chưa hỗ trợ'}</span>
    <div className="toolbar-spacer" /><DeviceStatus connected={connected} />
    <Button variant="secondary" onClick={onConnect} disabled={busy}><Cable />{connected ? 'Ngắt kết nối' : 'Kết nối'}</Button>
    <Button variant="danger" onClick={onStop} disabled={!busy}><CircleStop />Dừng</Button>
    <Button onClick={onRun} disabled={busy}><Play fill="currentColor" />{busy ? 'Đang xử lý…' : 'Chạy trên Leanbot'}</Button>
  </div>
}
