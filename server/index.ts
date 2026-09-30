import cors from 'cors'
import express from 'express'
import { compileArduino, type CompileRequest } from './compile.js'

const app = express()
app.use(cors({ origin: true }))
app.use(express.json({ limit: '300kb' }))
app.get('/api/health', (_request, response) => response.json({ ok: true, compiler: process.env.ARDUINO_CLI || 'arduino-cli' }))
app.post('/api/compile', async (request, response) => {
  const controller = new AbortController()
  response.on('close', () => { if (!response.writableEnded) controller.abort() })
  try {
    const result = await compileArduino(request.body as CompileRequest, controller.signal)
    response.status(result.success ? 200 : 422).json(result)
  } catch (error) {
    const message = error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 'Không tìm thấy Arduino CLI. Hãy cài Arduino CLI và arduino:avr core.' : error instanceof Error ? error.message : String(error)
    const clientError = message.includes('Source code') || message.includes('Target')
    response.status(controller.signal.aborted ? 499 : clientError ? 400 : 500).json({ success: false, stdout: message, errors: [] })
  }
})

const port = Number(process.env.PORT || 8787)
app.listen(port, () => console.log(`Leanbot compiler API listening on http://localhost:${port}`))
