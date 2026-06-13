import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

const port = Number(process.env.PORT ?? 8787)

const server = createServer((request: IncomingMessage, response: ServerResponse) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        service: 'drust-worker',
        status: 'ok',
        mode: 'prototype',
      }),
    )
    return
  }

  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(
    JSON.stringify({
      service: 'drust-worker',
      message: 'Worker scaffold ready for Rust+ and Discord integration.',
    }),
  )
})

server.listen(port, () => {
  console.log(`[drust-worker] listening on http://localhost:${port}`)
})
