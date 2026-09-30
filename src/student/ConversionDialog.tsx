import type { ConversionCandidate } from '../project/projectStore'
import { Button } from '../components/ui/button'
import { Dialog } from '../components/ui/dialog'

export function ConversionDialog({ candidate, onStay, onPartial, onCancel }: { candidate: ConversionCandidate | null; onStay(): void; onPartial(): void; onCancel(): void }) {
  return <Dialog open={Boolean(candidate)} onOpenChange={(open) => !open && onCancel()} title="Một số đoạn C++ hiện không thể chuyển sang Blocks" description="Code C++ gốc được giữ nguyên. Bạn có thể tiếp tục bằng C++ hoặc tạo Blocks chỉ sau khi chấp nhận phần được hỗ trợ.">
    <div className="diagnostic-list">{candidate?.result.diagnostics.map((item, index) => <div key={index}><b>Dòng {item.lineStart}{item.lineEnd !== item.lineStart ? `–${item.lineEnd}` : ''}</b><span>{item.message}</span></div>)}</div>
    <div className="dialog-actions"><Button variant="ghost" onClick={onCancel}>Hủy</Button><Button variant="secondary" onClick={onStay}>Tiếp tục C++</Button><Button onClick={onPartial}>Chỉ chuyển phần được hỗ trợ</Button></div>
  </Dialog>
}
