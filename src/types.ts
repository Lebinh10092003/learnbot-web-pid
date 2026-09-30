export type SensorSnapshot = {
  ir: number[]
  touch: boolean[]
  distanceCm: number
  motorLeft: number
  motorRight: number
  gripperLeft: number
  gripperRight: number
}

export type CompileResult = {
  success: boolean
  hex?: string
  stdout: string
  flashUsed?: number
  ramUsed?: number
  errors?: CompileError[]
}

export type CompileError = {
  file?: string
  line: number
  column: number
  message: string
}
