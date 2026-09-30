import { Activity, Gauge, Hand, Radar, RotateCw } from 'lucide-react'
import type { SensorSnapshot } from '../types'

function Meter({ value, max = 768 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return <div className="meter"><div style={{ width: `${pct}%` }} /></div>
}

export function SensorPanel({ data, connected }: { data: SensorSnapshot; connected: boolean }) {
  return (
    <aside className="device-panel">
      <div className="panel-header">
        <div><div className="eyebrow">DEVICE</div><strong>Leanbot Standard</strong></div>
        <span className={`status-pill ${connected ? 'connected' : ''}`}><i />{connected ? 'Connected' : 'Offline'}</span>
      </div>

      <div className="device-visual">
        <div className="robot-body">
          <span className="eye left"/><span className="eye right"/>
          <div className="center-led"/>
          <div className="wheel wl"/><div className="wheel wr"/>
        </div>
        <div className="device-caption">ATmega328P · 115200 baud</div>
      </div>

      <section className="sensor-card">
        <h4><Radar size={15}/> Line / IR</h4>
        {['IR2L','IR0L','IR1R','IR3R'].map((name, idx) => (
          <div className="sensor-row" key={name}><span>{name}</span><Meter value={data.ir[idx]} /><b>{data.ir[idx]}</b></div>
        ))}
      </section>

      <div className="two-cards">
        <section className="mini-card"><Gauge size={16}/><span>Ultrasonic</span><strong>{data.distanceCm.toFixed(1)} cm</strong></section>
        <section className="mini-card"><RotateCw size={16}/><span>Motion</span><strong>{data.motorLeft} / {data.motorRight}</strong></section>
      </div>

      <section className="sensor-card">
        <h4><Hand size={15}/> Touch</h4>
        <div className="touch-grid">
          {['TB1A','TB1B','TB2A','TB2B'].map((name, idx) => <div key={name} className={data.touch[idx] ? 'pressed' : ''}><span />{name}</div>)}
        </div>
      </section>

      <section className="sensor-card">
        <h4><Activity size={15}/> Gripper</h4>
        <div className="gripper-row"><span>Left</span><b>{data.gripperLeft}°</b><span>Right</span><b>{data.gripperRight}°</b></div>
      </section>
    </aside>
  )
}
