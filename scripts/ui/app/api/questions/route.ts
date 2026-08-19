//! A API das perguntas. É o único jeito de o CLI falar com o banco.
//!
//! `runtime = 'nodejs'` NÃO é detalhe: o RocksDB é um binding nativo, e o
//! runtime edge não carrega `.node`. Sem esta linha o build passa e a rota
//! explode em produção — falha tardia, que é a pior.
import { NextResponse } from 'next/server'
import { answer, ask, byId, listOpen, skip, varreVencidas } from '../../../lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  if (id) {
    const p = byId(id)
    return p ? NextResponse.json(p) : NextResponse.json({ erro: 'não existe' }, { status: 404 })
  }
  // A varredura roda na leitura da LISTA, e não num timer: quem abre a tela é
  // exatamente quem precisa do estado fresco, e assim não há relógio pra morrer
  // junto com o processo.
  await varreVencidas()
  return NextResponse.json(listOpen())
}

export async function POST(req: Request) {
  try {
    const b = await req.json()
    return NextResponse.json(await ask(b))
  } catch (e) {
    // 400 e não 500: as duas recusas do `ask` são erro de QUEM CHAMOU, e um 500
    // faria o CLI achar que o servidor caiu.
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 })
  }
}

export async function PATCH(req: Request) {
  const { id, indice } = await req.json()
  try {
    // `indice < 0` é o pulo. Um só verbo porque é uma só transição: aberta → fechada.
    const ok = indice < 0 ? await skip(id) : await answer(id, indice)
    // `false` = já estava fechada. 409, não 200: quem clicou precisa saber que
    // não foi a decisão dele que valeu.
    return NextResponse.json({ ok }, { status: ok ? 200 : 409 })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 })
  }
}
