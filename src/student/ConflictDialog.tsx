import { Button } from '../components/ui/button'
import { Dialog } from '../components/ui/dialog'
export function ConflictDialog({ open, cpp, onChoose, onCancel }: { open: boolean; cpp: string; onChoose(side: 'blocks' | 'cpp'): void; onCancel(): void }) {
  return <Dialog open={open} onOpenChange={(value) => !value && onCancel()} title="Cả Blocks và C++ đều đã được thay đổi" description="Chọn phiên bản làm nguồn chính. Hệ thống sẽ tạo lại biểu diễn còn lại sau khi bạn xác nhận.">
    <details><summary>So sánh thay đổi C++</summary><pre className="diff-preview">{cpp}</pre></details>
    <div className="dialog-actions"><Button variant="ghost" onClick={onCancel}>Hủy</Button><Button variant="secondary" onClick={() => onChoose('blocks')}>Dùng Blocks</Button><Button onClick={() => onChoose('cpp')}>Dùng C++</Button></div>
  </Dialog>
}
