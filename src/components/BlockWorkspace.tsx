import { Blocks, GripVertical, Plus } from 'lucide-react'

const categories = [
  ['Motion', 'motion'], ['Sensors', 'sensor'], ['Gripper', 'gripper'], ['RGB', 'rgb'], ['Sound', 'sound'], ['Control', 'control']
]

export function BlockWorkspace() {
  return (
    <div className="block-workspace">
      <aside className="block-toolbox">
        <div className="block-search">Tìm khối…</div>
        {categories.map(([name, type]) => <button key={name}><span className={`cat-dot ${type}`}/>{name}</button>)}
      </aside>
      <div className="block-canvas">
        <div className="block-hint"><Blocks size={15}/> Blockly mode prototype · các khối sẽ generate Arduino C++</div>
        <div className="block-stack">
          <div className="program-block control"><GripVertical size={14}/><b>Khi bắt đầu mission</b><span>TB1A + TB1B</span></div>
          <div className="nested-block motion"><GripVertical size={14}/><b>Chạy bánh xe</b><span>L 1000</span><span>R 1000</span></div>
          <div className="nested-block motion"><GripVertical size={14}/><b>Đi quãng đường</b><span>300 mm</span></div>
          <div className="nested-block sensor"><GripVertical size={14}/><b>Nếu khoảng cách</b><span>&lt; 20 cm</span></div>
          <div className="deep-block rgb"><GripVertical size={14}/><b>LED O</b><span>Đỏ</span></div>
          <div className="nested-block motion"><GripVertical size={14}/><b>Quay phải</b><span>90°</span><span>650</span></div>
          <button className="add-block"><Plus size={14}/> Thêm khối</button>
        </div>
      </div>
    </div>
  )
}
