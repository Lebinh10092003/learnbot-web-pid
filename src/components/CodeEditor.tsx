import { Braces, Code2 } from 'lucide-react'

export function CodeEditor({ code, onChange }: { code: string; onChange: (code: string) => void }) {
  const lines = code.split('\n').length
  return (
    <div className="editor-wrap">
      <div className="editor-tabs">
        <button className="editor-tab active"><Code2 size={14}/> main.ino <span>●</span></button>
        <button className="editor-tab"><Braces size={14}/> Blockly</button>
      </div>
      <div className="editor">
        <div className="line-numbers" aria-hidden="true">{Array.from({ length: lines }, (_, i) => <span key={i}>{i + 1}</span>)}</div>
        <textarea spellCheck={false} value={code} onChange={(e) => onChange(e.target.value)} aria-label="Arduino code editor" />
      </div>
    </div>
  )
}
