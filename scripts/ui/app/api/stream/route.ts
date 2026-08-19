//! SSE: a tela acorda quando o banco muda. É o realtime inteiro.
//!
//! Substitui a subscrição reativa do Convex por um `EventEmitter` no mesmo
//! processo — e é MENOS peça, não mais: o banco, a API e a tela agora vivem
//! juntos, então o evento não precisa atravessar rede nenhuma pra chegar aqui.
import { bus } from '../../../lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const enc = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const envia = () => controller.enqueue(enc.encode('data: mudou\n\n'))
      // O primeiro evento sai na hora: sem ele a tela espera a PRÓXIMA mudança
      // pra carregar, e uma pergunta que já estava aberta não apareceria.
      envia()
      bus.on('mudou', envia)
      // KEEPALIVE de 25s. Proxy e navegador matam conexão SSE ociosa, e o
      // sintoma é uma tela que para de atualizar sem erro nenhum.
      const ka = setInterval(() => controller.enqueue(enc.encode(': ka\n\n')), 25_000)
      req.signal.addEventListener('abort', () => {
        clearInterval(ka)
        bus.off('mudou', envia)
        controller.close()
      })
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
