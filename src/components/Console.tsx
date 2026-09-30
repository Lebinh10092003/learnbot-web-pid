import { Bug, CircleCheck, TerminalSquare } from 'lucide-react'

export function Console({ output, serial, compiling }: { output: string; serial: string; compiling: boolean }) {
  return (
    <div className="console-wrap">
      <div className="console-tabs">
        <button className="active"><TerminalSquare size={13}/> OUTPUT</button>
        <button><Bug size={13}/> PROBLEMS <span className="badge">0</span></button>
        <div className="console-spacer"/>
        <span className="console-state"><CircleCheck size={13}/> {compiling ? 'Compiling…' : 'Ready'}</span>
      </div>
      <pre>{output || serial || 'Leanbot Studio ready. Chọn Compile để kiểm tra chương trình.'}</pre>
    </div>
  )
}
