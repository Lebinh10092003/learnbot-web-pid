import Editor, { type Monaco, type OnMount } from '@monaco-editor/react'
import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { editor } from 'monaco-editor'
import type { Diagnostic } from '../transpiler'
import { configureLeanbotLanguage, diagnosticsToMarkers } from './leanbotLanguage'

export interface EditorCommands { undo(): void; redo(): void; save(): void }

export const CppEditor = forwardRef<EditorCommands, { value: string; diagnostics: Diagnostic[]; onChange(value: string): void; onSave(): void }>(function CppEditor({ value, diagnostics, onChange, onSave }, ref) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const mount: OnMount = (instance, monaco) => {
    editorRef.current = instance; monacoRef.current = monaco
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, onSave)
    monaco.editor.setModelMarkers(instance.getModel()!, 'leanbot', diagnosticsToMarkers(monaco, diagnostics))
  }
  useImperativeHandle(ref, () => ({ undo: () => editorRef.current?.trigger('toolbar', 'undo', null), redo: () => editorRef.current?.trigger('toolbar', 'redo', null), save: onSave }), [onSave])
  return <Editor beforeMount={configureLeanbotLanguage} onMount={mount} language="cpp" theme="vs" value={value} onChange={(next) => onChange(next ?? '')} options={{ fontSize: 14, lineHeight: 22, minimap: { enabled: false }, automaticLayout: true, tabSize: 2, wordWrap: 'off', scrollBeyondLastLine: false, bracketPairColorization: { enabled: true }, padding: { top: 16 }, suggest: { showMethods: true } }} />
})
