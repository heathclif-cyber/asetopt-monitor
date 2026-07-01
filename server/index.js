import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = process.env.PORT || 3001
const API_PROXY_URL = process.env.API_PROXY_URL?.replace(/\/$/, '')

app.get('/health', (_, res) => res.json({ status: 'ok', api_proxy: Boolean(API_PROXY_URL) }))

if (API_PROXY_URL) {
  const proxy = createProxyMiddleware({
    target: API_PROXY_URL,
    changeOrigin: true,
    pathFilter: (pathname) => pathname.startsWith('/api') || pathname.startsWith('/rest/v1'),
    on: {
      error: (err, _req, res) => {
        console.error('API proxy error:', err.message)
        if (!res.headersSent) {
          res.status(502).json({ detail: `API tidak tersedia (${err.message})` })
        }
      },
    },
  })
  app.use(proxy)
  console.log(`Proxy /api dan /rest/v1 → ${API_PROXY_URL}`)
} else {
  console.warn('API_PROXY_URL tidak diset — /api tidak di-proxy (gunakan VITE_API_URL saat build atau set API_PROXY_URL)')
}

const distPath = join(__dirname, '../dist')
app.use(express.static(distPath))
app.get(/.*/, (req, res) => {
  res.sendFile(join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`)
})