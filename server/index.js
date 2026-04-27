import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = process.env.PORT || 3001

app.get('/health', (_, res) => res.json({ status: 'ok' }))

const distPath = join(__dirname, '../dist')
app.use(express.static(distPath))
app.get(/.*/, (req, res) => {
  res.sendFile(join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`)
})
