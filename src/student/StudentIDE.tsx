import { Bot, Cloud, Save, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BlocklyCommands } from '../editors/BlocklyEditor'
import { BlocklyEditor } from '../editors/BlocklyEditor'
import type { EditorCommands } from '../editors/CppEditor'
import { CppEditor } from '../editors/CppEditor'
import { defaultCode } from '../lib/defaultCode'
import { LeanbotSerialClient } from '../lib/serial'
import { compileLeanbot } from '../leanbot/compile/compilerClient'
import { uploadHex, type UploadPhase } from '../leanbot/upload/stk500'
import { bindProjectPersistence, loadProject, saveProject } from '../project/projectPersistence'
import { acceptBlocksCandidate, createBlocksCandidate, createProject, resolveConflict, synchronizeToCpp, updateBlocks, updateCpp, type ConversionCandidate, type LeanbotProject, type SourceMode } from '../project/projectStore'
import { cppToIr } from '../transpiler'
import { Toast } from '../components/ui/toast'
import { ConflictDialog } from './ConflictDialog'
import { ConversionDialog } from './ConversionDialog'
import { Toolbar } from './Toolbar'

function initialProject() {
  return loadProject() ?? createProject(cppToIr(defaultCode).program)
}

export function StudentIDE() {
  const [project, setProject] = useState<LeanbotProject>(initialProject)
  const [candidate, setCandidate] = useState<ConversionCandidate | null>(null)
  const [conflictOpen, setConflictOpen] = useState(false)
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ message: string; tone: 'info' | 'success' | 'error' } | null>(null)
  const projectRef = useRef(project)
  const cppRef = useRef<EditorCommands>(null)
  const blocksRef = useRef<BlocklyCommands>(null)
  const serial = useMemo(() => new LeanbotSerialClient(), [])
  const persistenceRef = useRef<ReturnType<typeof bindProjectPersistence> | null>(null)
  const runAbortRef = useRef<AbortController | null>(null)

  useEffect(() => { projectRef.current = project; persistenceRef.current?.schedule() }, [project])
  useEffect(() => {
    persistenceRef.current = bindProjectPersistence(() => projectRef.current, () => setNotice({ message: 'Không thể lưu project trên trình duyệt. Chương trình vẫn được giữ trong phiên này.', tone: 'error' }))
    serial.onDisconnect = () => setConnected(false)
    return () => { persistenceRef.current?.flush(); persistenceRef.current?.dispose(); void serial.disconnect() }
  }, [serial])

  function changeMode(mode: SourceMode) {
    if (mode === project.sourceMode) return
    if (project.syncState === 'conflict') { setConflictOpen(true); return }
    if (mode === 'cpp') { setProject(synchronizeToCpp(project)); return }
    const next = createBlocksCandidate(project)
    if (next.result.status === 'unsupported') { setCandidate(next); return }
    setProject(acceptBlocksCandidate(project, next))
  }

  async function connect() {
    if (connected) { await serial.disconnect(); setConnected(false); return }
    try { await serial.connect(); setConnected(true); setNotice({ message: 'Leanbot đã kết nối qua USB.', tone: 'success' }) }
    catch (error) { setNotice({ message: error instanceof Error ? error.message : String(error), tone: 'error' }) }
  }

  async function run() {
    const controller = new AbortController()
    runAbortRef.current?.abort()
    runAbortRef.current = controller
    setBusy(true)
    const sourceProject = project.sourceMode === 'blocks' ? synchronizeToCpp(project) : project
    if (project.sourceMode === 'blocks') setProject({ ...sourceProject, sourceMode: 'blocks' })
    setNotice({ message: 'Đang biên dịch chương trình mới nhất…', tone: 'info' })
    try {
      const result = await compileLeanbot(sourceProject.cppSource, { signal: controller.signal })
      if (!result.success || !result.hex) { setNotice({ message: result.errors?.[0] ? `Dòng ${result.errors[0].line}: ${result.errors[0].message}` : result.stdout, tone: 'error' }); return }
      if (!connected) { setNotice({ message: 'Biên dịch thành công. Hãy kết nối Leanbot để nạp chương trình.', tone: 'info' }); return }
      const phaseLabel: Record<UploadPhase, string> = { idle: 'Sẵn sàng.', resetting: 'Đang khởi động bootloader…', syncing: 'Đang đồng bộ Leanbot…', uploading: 'Đang ghi firmware…', verifying: 'Đang xác minh firmware…', done: 'Nạp chương trình thành công.' }
      const transport = await serial.createUploadTransport()
      await uploadHex(transport, result.hex, { signal: controller.signal, onProgress: (phase, progress) => setNotice({ message: `${phaseLabel[phase]}${['uploading', 'verifying'].includes(phase) ? ` ${Math.round(progress * 100)}%` : ''}`, tone: phase === 'done' ? 'success' : 'info' }) })
    }
    catch (error) { setNotice({ message: error instanceof Error ? error.message : String(error), tone: 'error' }) }
    finally { if (runAbortRef.current === controller) runAbortRef.current = null; setBusy(false) }
  }

  function stop() {
    runAbortRef.current?.abort()
    runAbortRef.current = null
    setBusy(false)
    setNotice({ message: 'Đã hủy tiến trình biên dịch hoặc nạp chương trình.', tone: 'info' })
  }

  const activeCommands = project.sourceMode === 'blocks' ? blocksRef.current : cppRef.current

  return <main className="student-shell">
    <header className="student-header">
      <div className="brand-lockup"><span className="brand-icon"><Bot /></span><div><strong>Leanbot Studio</strong><small>Student IDE</small></div></div>
      <div className="project-name"><span>Project</span><button>{project.name}</button></div>
      <div className="save-state"><Save />Tự động lưu<small>{new Date(project.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</small></div>
    </header>
    <Toolbar mode={project.sourceMode} syncState={project.syncState} connected={connected} busy={busy} onMode={changeMode} onUndo={() => activeCommands?.undo()} onRedo={() => activeCommands?.redo()} onZoomIn={() => blocksRef.current?.zoomIn()} onZoomOut={() => blocksRef.current?.zoomOut()} onCenter={() => blocksRef.current?.center()} onConnect={() => void connect()} onRun={() => void run()} onStop={stop} />
    <section className="editor-stage" aria-label="Không gian lập trình">
      {project.sourceMode === 'blocks'
        ? <BlocklyEditor key={project.baselineBlocksHash} ref={blocksRef} state={project.blockWorkspace} onChange={(state) => setProject((current) => updateBlocks(current, state))} />
        : <CppEditor ref={cppRef} value={project.cppSource} diagnostics={project.diagnostics} onChange={(source) => setProject((current) => updateCpp(current, source))} onSave={() => { saveProject(projectRef.current); setNotice({ message: 'Đã lưu project.', tone: 'success' }) }} />}
    </section>
    <footer className="student-footer"><span><Sparkles />Hai chế độ, một chương trình</span><span><Cloud />Lưu trên trình duyệt</span><span className="footer-help">Blockly ↔ IR ↔ Arduino C++</span></footer>
    <ConversionDialog candidate={candidate} onCancel={() => setCandidate(null)} onStay={() => { setCandidate(null); setProject((current) => ({ ...current, sourceMode: 'cpp', syncState: 'unsupported-cpp', diagnostics: candidate?.result.diagnostics ?? [] })) }} onPartial={() => { if (candidate) setProject(acceptBlocksCandidate(project, candidate, true)); setCandidate(null) }} />
    <ConflictDialog open={conflictOpen} cpp={project.cppSource} onCancel={() => setConflictOpen(false)} onChoose={(side) => { setProject(resolveConflict(project, side)); setConflictOpen(false) }} />
    {notice && <Toast {...notice} onClose={() => setNotice(null)} />}
  </main>
}
