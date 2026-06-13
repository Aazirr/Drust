import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = fileURLToPath(new URL('.', import.meta.url))
const distDir = join(currentDir, 'dist')
const indexFile = join(distDir, 'index.html')
const port = Number(process.env.PORT ?? 3000)
const host = '0.0.0.0'

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function getContentType(filePath) {
  return mimeTypes[extname(filePath)] ?? 'application/octet-stream'
}

async function resolveFilePath(urlPathname) {
  const normalizedPath = normalize(decodeURIComponent(urlPathname)).replace(/^(\.\.[/\\])+/, '')
  const requestPath = normalizedPath === '/' ? '/index.html' : normalizedPath
  const filePath = join(distDir, requestPath)

  try {
    const fileStats = await stat(filePath)

    if (fileStats.isFile()) {
      return filePath
    }
  } catch {
    return indexFile
  }

  return indexFile
}

if (!existsSync(indexFile)) {
  console.error('Missing web build output. Run `npm --workspace @drust/web run build` before starting.')
  process.exit(1)
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    const filePath = await resolveFilePath(requestUrl.pathname)
    const isHtml = filePath.endsWith('.html')

    response.writeHead(200, {
      'cache-control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
      'content-type': getContentType(filePath),
    })

    createReadStream(filePath).pipe(response)
  } catch (error) {
    console.error('Failed to serve web app.', error)
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Internal server error')
  }
})

server.listen(port, host, () => {
  console.log(`Drust web listening on http://${host}:${port}`)
})
