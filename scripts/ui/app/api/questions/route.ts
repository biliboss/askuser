//! A API das rodadas. É o único jeito de o CLI falar com o banco.
//!
//! `runtime = 'nodejs'` NÃO é detalhe: o RocksDB é binding nativo, e o runtime
//! edge não carrega `.node`. Sem esta linha o build passa e a rota explode em
//! produção — falha tardia, que é a pior.
import { NextResponse } from 'next/server'
import { abre, byId, listOpen, pula, responde, varreVencidas } from '../../../lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  if (id) {
    const r = byId(id)
    return r ? NextResponse.json(r) : NextResponse.json({ erro: 'não existe' }, { status: 404 })
  }
  // A varredura roda na leitura da LISTA, e não num timer: quem abre a tela é
  // quem precisa do estado fresco, e assim não há relógio pra morrer junto com
  // o processo.
  await varreVencidas()
  return NextResponse.json(listOpen())
}

export async function POST(req: Request) {
  try {
    return NextResponse.json(await abre(await req.json()))
  } catch (e) {
    // 400 e não 500: as recusas do contrato são erro de QUEM CHAMOU, e um 500
    // faria o CLI achar que o servidor caiu.
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 })
  }
}

/**
 * Fecha a rodada. `respostas` ausente = PULOU.
 *
 * Um verbo só porque é uma transição só: aberta → fechada. Separar em duas
 * rotas duplicaria o guard, e é o guard que impede dois desfechos pro mesmo id.
 */
export async function PATCH(req: Request) {
  const { id, respostas } = await req.json()
  try {
    const ok = respostas ? await responde(id, respostas) : await pula(id)
    // `false` = já estava fechada. 409, não 200: quem clicou precisa saber que
    // não foi a decisão dele que valeu.
    return NextResponse.json({ ok }, { status: ok ? 200 : 409 })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 400 })
  }
}
