#!/usr/bin/env bun
/**
 * askuser — pergunta pra uma pessoa e ESPERA a resposta, de dentro de um script.
 *
 *   askuser "Disparo as 4 unidades?" \
 *     -o "faz|4 agentes · ~12 min de parede" \
 *     -o "espera|primeiro decido a S5"
 *
 * A pergunta aparece no app (uma aba, um celular, o que estiver aberto), e o
 * comando fica bloqueado até alguém decidir. A resposta sai em JSON no stdout, e
 * o CÓDIGO DE SAÍDA diz o que aconteceu sem ninguém precisar parsear nada.
 *
 * ## As quatro saídas
 *
 *   0  escolheu    — `escolha` e `indice` valem
 *   2  PULOU       — a pessoa viu e decidiu não decidir agora
 *   3  EXPIROU     — o prazo acabou e ninguém respondeu
 *   1  erro        — o app não respondeu, ou a chamada estava errada
 *
 * Pular e expirar são estados de primeira classe, não `resposta` vazia. "Não
 * quis decidir", "o tempo acabou" e "escolheu a primeira opção" são três fatos
 * diferentes, e quem chama precisa distinguir os três sem adivinhar. Um script
 * que trata 2 e 3 como 0 vai seguir com uma decisão que ninguém tomou.
 *
 * ## Por que isto existe
 *
 * Um agente automatizado que precisa de uma decisão humana costuma perguntar no
 * lugar onde ele mesmo roda — um terminal, um pane, um log. Se ninguém está
 * olhando ali, ele fica esperando em SILÊNCIO, e de fora isso é indistinguível
 * de estar trabalhando. Quando alguém enfim olha, o contexto é de horas atrás, e
 * decisão tomada tarde sobre estado que já mudou é decisão errada com cara de
 * decisão.
 *
 * `ASKUSER_URL` aponta pra outra máquina. Padrão: `http://127.0.0.1:5311`.
 */

const APP = process.env.ASKUSER_URL ?? 'http://127.0.0.1:5311'

const USO = `askuser — pergunta pra uma pessoa e espera a resposta

  askuser <pergunta> -o "<rótulo>[|<descrição>]" -o "..." [-t <minutos>] [--json]

  -o, --opcao     uma opção; repita. Mínimo 2
  -t, --minutos   quanto a pergunta vive antes de expirar (padrão 30)
      --json      só o JSON, sem a linha legível

  saída: 0 escolheu · 2 pulou · 3 expirou · 1 erro`

type Opcao = { rotulo: string; descricao?: string }

/** `rótulo|descrição`. A PRIMEIRA barra separa — rótulo com barra continua inteiro. */
function parseOpcao(s: string): Opcao {
  const i = s.indexOf('|')
  if (i < 0) return { rotulo: s.trim() }
  return { rotulo: s.slice(0, i).trim(), descricao: s.slice(i + 1).trim() || undefined }
}

async function api(metodo: string, corpo?: unknown, query = '') {
  const r = await fetch(`${APP}/api/questions${query}`, {
    method: metodo,
    headers: corpo ? { 'content-type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((d as { erro?: string }).erro ?? `${r.status}`)
  return d
}

export async function main(argv: string[]): Promise<number> {
  const morre = (m: string) => (console.error(m), 1)

  let pergunta = ''
  const opcoes: Opcao[] = []
  let minutos = 30
  let json = false

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-o' || a === '--opcao') opcoes.push(parseOpcao(argv[++i] ?? ''))
    else if (a === '-t' || a === '--minutos') minutos = Number(argv[++i])
    else if (a === '--json') json = true
    else if (a === '-h' || a === '--help') return (console.log(USO), 0)
    else if (!pergunta) pergunta = a
  }

  // AS DUAS RECUSAS, e elas vêm ANTES de qualquer ida na rede. Uma pergunta com
  // uma opção só é um `enter` disfarçado de decisão — ela interrompe alguém pra
  // nada, e o app existe justamente pra não gastar a atenção de quem decide.
  if (!pergunta.trim()) return morre(USO)
  if (opcoes.length < 2)
    return morre(`${opcoes.length} opção(ões): uma escolha precisa de duas.\n  -o "faz|o que acontece" -o "espera|o que acontece"`)
  if (!Number.isFinite(minutos) || minutos <= 0) return morre(`-t ${minutos}: minutos tem que ser um número > 0`)

  // A ORIGEM não é enfeite: pergunta sem dono é decisão tomada sobre um contexto
  // que quem responde não consegue reconstruir. O que o ambiente souber, vai junto.
  const origem = {
    agente: process.env.ASKUSER_AGENT,
    pane: process.env.ASKUSER_PANE ?? process.env.HERDR_PANE_ID,
    run: process.env.ASKUSER_RUN,
    host: process.env.HOSTNAME ?? process.env.HOST,
  }

  let id: string
  try {
    const p = (await api('POST', { texto: pergunta, opcoes, origem, vidaMs: minutos * 60_000 })) as { id: string }
    id = p.id
  } catch (e) {
    // "NÃO CONSEGUI PERGUNTAR" tem que sair diferente de "perguntei e ninguém
    // respondeu". Sem essa distinção, um app fora do ar vira uma decisão
    // fantasma — e o script segue como se alguém tivesse escolhido.
    return morre(`não consegui registrar a pergunta em ${APP}\n  ${(e as Error).message}\n  o app está de pé? \`bun run start\``)
  }

  // POLLING de 1s. O processo já está bloqueado esperando a decisão; um segundo
  // é imperceptível pra quem decide e barato pra quem espera.
  //
  // O VENCIMENTO não depende de nada rodando: `expiraEm` fica gravado, e o
  // servidor trata como expirada toda pergunta cujo prazo passou, na LEITURA.
  // Não há relógio pra morrer junto com um processo.
  for (;;) {
    const q = (await api('GET', undefined, `?id=${id}`)) as {
      estado: string
      resposta?: { indice: number; escolha: string }
    }
    if (q.estado !== 'OPEN') {
      const saida = {
        id,
        estado: q.estado,
        escolha: q.resposta?.escolha ?? '',
        indice: q.resposta?.indice ?? -1,
        pulou: q.estado === 'SKIPPED',
        expirou: q.estado === 'EXPIRED',
      }
      console.log(json ? JSON.stringify(saida) : q.estado === 'ANSWERED' ? `${saida.indice + 1}. ${saida.escolha}` : q.estado.toLowerCase())
      return q.estado === 'ANSWERED' ? 0 : q.estado === 'SKIPPED' ? 2 : 3
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
}

if (import.meta.main) process.exit(await main(Bun.argv.slice(2)))
