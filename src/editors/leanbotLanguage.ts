import type { Monaco } from '@monaco-editor/react'
import type { editor, Position } from 'monaco-editor'
import type { Diagnostic } from '../transpiler'

export const LEANBOT_COMPLETIONS = [
  'Leanbot.begin', 'LbMotion.runLR', 'LbMotion.runLRrpm', 'LbMotion.waitDistanceMm',
  'LbMotion.waitRotationDeg', 'LbMotion.stopAndWait', 'LbGripper.open', 'LbGripper.close',
  'LbGripper.moveTo', 'LbRGB', 'LbIRLine', 'LbIRArray', 'LbTouch', 'Leanbot.pingCm',
  'Leanbot.pingMm', 'Leanbot.tone', 'LbDelay', 'LbMission.begin', 'LbMission.end',
]

export function configureLeanbotLanguage(monaco: Monaco) {
  monaco.languages.registerCompletionItemProvider('cpp', {
    provideCompletionItems(model: editor.ITextModel, position: Position) {
      const word = model.getWordUntilPosition(position)
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn }
      return { suggestions: LEANBOT_COMPLETIONS.map((label) => ({ label, kind: monaco.languages.CompletionItemKind.Method, insertText: label, detail: 'Leanbot API', range })) }
    },
  })
}

export function diagnosticsToMarkers(monaco: Monaco, diagnostics: Diagnostic[]) {
  return diagnostics.map((item) => ({
    severity: item.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
    message: item.message,
    startLineNumber: item.lineStart,
    endLineNumber: item.lineEnd,
    startColumn: 1,
    endColumn: 120,
  }))
}
