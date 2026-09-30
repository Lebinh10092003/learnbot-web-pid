import * as Blockly from 'blockly/core'
import 'blockly/blocks'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { registerLeanbotBlocks } from '../blockly/blocks/leanbotBlocks'
import { leanbotToolbox } from '../blockly/toolbox/toolbox'
import { stateToProgram, type BlocklyWorkspaceState } from '../blockly/serialization/adapters'
import type { LeanbotProgram } from '../transpiler'

export interface BlocklyCommands { undo(): void; redo(): void; zoomIn(): void; zoomOut(): void; center(): void }

export const BlocklyEditor = forwardRef<BlocklyCommands, { state: BlocklyWorkspaceState; onChange(state: BlocklyWorkspaceState, program: LeanbotProgram): void }>(function BlocklyEditor({ state, onChange }, ref) {
  const hostRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null)
  const loadingRef = useRef(false)
  useImperativeHandle(ref, () => ({
    undo: () => workspaceRef.current?.undo(false), redo: () => workspaceRef.current?.undo(true),
    zoomIn: () => workspaceRef.current?.zoomCenter(1), zoomOut: () => workspaceRef.current?.zoomCenter(-1), center: () => workspaceRef.current?.scrollCenter(),
  }), [])
  useEffect(() => {
    registerLeanbotBlocks()
    if (!hostRef.current) return
    const workspace = Blockly.inject(hostRef.current, { toolbox: leanbotToolbox as Blockly.utils.toolbox.ToolboxDefinition, renderer: 'zelos', trashcan: true, grid: { spacing: 20, length: 2, colour: '#d9e2ec', snap: true }, zoom: { controls: false, wheel: true, startScale: 0.9, maxScale: 1.5, minScale: 0.45 }, move: { scrollbars: true, drag: true, wheel: true } })
    workspaceRef.current = workspace
    loadingRef.current = true
    Blockly.serialization.workspaces.load(state, workspace)
    requestAnimationFrame(() => { loadingRef.current = false })
    const listener = (event: Blockly.Events.Abstract) => {
      if (loadingRef.current || event.isUiEvent || !event.recordUndo) return
      const next = Blockly.serialization.workspaces.save(workspace)
      onChange(next, stateToProgram(next))
    }
    workspace.addChangeListener(listener)
    const observer = new ResizeObserver(() => Blockly.svgResize(workspace)); observer.observe(hostRef.current)
    return () => { observer.disconnect(); workspace.removeChangeListener(listener); workspace.dispose(); workspaceRef.current = null }
  }, [])
  return <div ref={hostRef} className="blockly-host" aria-label="Trình soạn thảo Blockly" />
})
