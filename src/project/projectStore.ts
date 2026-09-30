import { cppToIr, irToCpp, type ConversionResult, type LeanbotProgram } from '../transpiler'
import { programToWorkspaceState, stateToProgram, type BlocklyWorkspaceState } from '../blockly/serialization/adapters'

export type SourceMode = 'blocks' | 'cpp'
export type SyncState = 'synced' | 'blocks-newer' | 'cpp-newer' | 'unsupported-cpp' | 'conflict'

export interface LeanbotProject {
  id: string
  name: string
  sourceMode: SourceMode
  cppSource: string
  blockWorkspace: BlocklyWorkspaceState
  ir: LeanbotProgram
  syncState: SyncState
  cppRevision: number
  blocksRevision: number
  baselineCppHash: string
  baselineBlocksHash: string
  diagnostics: ConversionResult['diagnostics']
  updatedAt: number
}

export interface ConversionCandidate { result: ConversionResult; workspace: BlocklyWorkspaceState }

export function hashValue(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619) }
  return (hash >>> 0).toString(16)
}

export function createProject(program: LeanbotProgram, name = 'Bài 01'): LeanbotProject {
  const cppSource = irToCpp(program)
  const blockWorkspace = programToWorkspaceState(program)
  return { id: crypto.randomUUID?.() ?? `project-${Date.now()}`, name, sourceMode: 'blocks', cppSource, blockWorkspace, ir: program, syncState: 'synced', cppRevision: 0, blocksRevision: 0, baselineCppHash: hashValue(cppSource), baselineBlocksHash: hashValue(blockWorkspace), diagnostics: [], updatedAt: Date.now() }
}

export function updateCpp(project: LeanbotProject, cppSource: string): LeanbotProject {
  const blocksDirty = hashValue(project.blockWorkspace) !== project.baselineBlocksHash
  return { ...project, cppSource, cppRevision: project.cppRevision + 1, syncState: blocksDirty ? 'conflict' : 'cpp-newer', updatedAt: Date.now() }
}

export function updateBlocks(project: LeanbotProject, blockWorkspace: BlocklyWorkspaceState): LeanbotProject {
  const cppDirty = hashValue(project.cppSource) !== project.baselineCppHash
  const ir = stateToProgram(blockWorkspace)
  return { ...project, blockWorkspace, ir, blocksRevision: project.blocksRevision + 1, syncState: cppDirty ? 'conflict' : 'blocks-newer', updatedAt: Date.now() }
}

export function synchronizeToCpp(project: LeanbotProject): LeanbotProject {
  if (project.syncState === 'conflict') return project
  const cppSource = irToCpp(project.ir)
  return { ...project, sourceMode: 'cpp', cppSource, syncState: 'synced', baselineCppHash: hashValue(cppSource), baselineBlocksHash: hashValue(project.blockWorkspace), diagnostics: [], updatedAt: Date.now() }
}

export function createBlocksCandidate(project: LeanbotProject): ConversionCandidate {
  const result = cppToIr(project.cppSource)
  return { result, workspace: programToWorkspaceState(result.program) }
}

export function acceptBlocksCandidate(project: LeanbotProject, candidate: ConversionCandidate, allowUnsupported = false): LeanbotProject {
  if (candidate.result.status === 'unsupported' && !allowUnsupported) return { ...project, syncState: 'unsupported-cpp', diagnostics: candidate.result.diagnostics }
  return { ...project, sourceMode: 'blocks', ir: candidate.result.program, blockWorkspace: candidate.workspace, syncState: 'synced', baselineCppHash: hashValue(project.cppSource), baselineBlocksHash: hashValue(candidate.workspace), diagnostics: candidate.result.diagnostics, updatedAt: Date.now() }
}

export function resolveConflict(project: LeanbotProject, winner: SourceMode): LeanbotProject {
  if (winner === 'blocks') return synchronizeToCpp({ ...project, syncState: 'blocks-newer' })
  const candidate = createBlocksCandidate(project)
  return acceptBlocksCandidate({ ...project, syncState: 'cpp-newer' }, candidate, true)
}

export function freshestCppSource(project: LeanbotProject) {
  return project.syncState === 'blocks-newer' ? irToCpp(project.ir) : project.cppSource
}
