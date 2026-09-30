import { Box, ChevronDown, FileCode2, FolderOpen, Settings2 } from 'lucide-react'

export function FileTree() {
  return (
    <aside className="file-tree">
      <div className="section-title"><span>EXPLORER</span><button>•••</button></div>
      <div className="project-title"><ChevronDown size={14} /> LEANBOT-DEMO</div>
      <div className="tree-item folder"><ChevronDown size={13}/><FolderOpen size={14}/> src</div>
      <div className="tree-item child active"><FileCode2 size={14}/> main.ino <span className="dot" /></div>
      <div className="tree-item child"><FileCode2 size={14}/> helpers.h</div>
      <div className="tree-item folder"><ChevronDown size={13}/><FolderOpen size={14}/> examples</div>
      <div className="tree-item child"><FileCode2 size={14}/> line-follow.ino</div>
      <div className="tree-item child"><FileCode2 size={14}/> gripper.ino</div>
      <div className="tree-item"><Box size={14}/> libraries</div>
      <div className="tree-item"><Settings2 size={14}/> leanbot.config.json</div>
      <div className="outline-block">
        <div className="outline-title">OUTLINE</div>
        <div className="outline-row">ƒ setup()</div>
        <div className="outline-row">ƒ loop()</div>
      </div>
    </aside>
  )
}
