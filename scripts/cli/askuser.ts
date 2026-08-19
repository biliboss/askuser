#!/usr/bin/env bun
/**
 * askuser — pergunta pra uma pessoa e ESPERA a decisão, de dentro de um script.
 *
 * Implementa o contrato do `AskUserQuestion`: **1 a 4 perguntas por chamada**,
 * cada uma com `header`, 2 a 4 opções com `label`/`description`/`preview`,
 * `multiSelect` onde cabe, e um "Other" de texto livre que existe SEMPRE.
 *
 * ## Duas formas de chamar, e a curta cobre o caso comum
 *
 *     askuser "Disparo as 4 unidades?" \
 *       -o "faz|4 agentes · ~12 min de parede" \
 *       -o "espera|primeiro decido a S5"
 *
 *     askuser --json '{"perguntas":[…]}'      # o contrato inteiro
 *     echo '{…}' | askuser -                  # idem, por stdin
 *
 * A forma curta é uma pergunta com header derivado. Ela existe porque a maioria
 * das chamadas é uma decisão só, e obrigar JSON pra isso faria todo mundo
 * escrever um heredoc pra perguntar "sim ou não".
 *
 * ## As quatro saídas
 *
 *     0  escolheu    2  PULOU    3  EXPIROU    1  erro
 *
 * `pulou` e `expirou` são estados de primeira classe. Um script que trata 2 ou 3
 * como 0 segue adiante com uma decisão que ninguém tomou — o pior desfecho
 * possível, e o que a maioria das APIs de prompt permite por omissão. E `1`
 * significa "não consegui perguntar", não "ninguém respondeu".
 *
 * A saída em JSON é endereçada pelo TEXTO da pergunta, igual ao
 * `AskUserQuestion`:
 *
 *     {"estado":"ANSWERED","respostas":{"Disparo?":{"escolhas":["faz"]}}}
 */

import { askuser as abreJanela } from '../askuser.ts'
import { alturaPara, garanteApp } from '../shared.ts'

const APP = process.env.ASKUSER_URL ?? 'http://127.0.0.1:5311'

const USO = `askuser — pergunta pra uma pessoa e espera a decisão

  askuser <pergunta> -o "<label>[|<descrição>]" ... [-H <header>] [-m] [-t <min>] [--json]
  askuser --spec '<json>'          o contrato inteiro: até 4 perguntas
  echo '<json>' | askuser -        idem, por stdin

  -o, --opcao     uma opção; repita. 2 a 4
  -H, --header    o chip da pergunta (até 12 chars). Omitido, sai da pergunta
  -m, --multi     as opções não são mutuamente exclusivas
  -t, --minutos   quanto ela vive antes de expirar (padrão 30)
      --json      só o JSON, sem a linha legível

  spec: {"perguntas":[{"question","header","description"?,"multiSelect"?,"options":[{"label","description"?,"preview"?}]}]}

  saída: 0 escolheu · 2 pulou · 3 expirou · 1 erro`

type Opcao = { label: string; description?: string; preview?: string }
type Pergunta = {
  question: string
  header: string
  /** O que está em jogo, até 7 palavras. Aparece na lista lateral. */
  description?: string
  options: Opcao[]
  multiSelect?: boolean
}

/** `label|descrição`. A PRIMEIRA barra separa — label com barra continua inteiro. */
function parseOpcao(s: string): Opcao {
  const i = s.indexOf('|')
  if (i < 0) return { label: s.trim() }
  return { label: s.slice(0, i).trim(), description: s.slice(i + 1).trim() || undefined }
}

/**
 * O header, quando ninguém deu: as primeiras palavras da pergunta, até 12 chars.
 *
 * Derivar é melhor que exigir na forma curta — mas pior que escrever, e por isso
 * `-H` existe. Um header derivado de "Você prefere que eu…" vira "Você prefere",
 * que não rotula nada.
 */
function headerDerivado(pergunta: string): string {
  const limpo = pergunta.replace(/[?¿!.,;:]/g, '').trim()
  let out = ''
  for (const palavra of limpo.split(/\s+/)) {
    if ((out ? `${out} ${palavra}` : palavra).length > 12) break
    out = out ? `${out} ${palavra}` : palavra
  }
  return out || limpo.slice(0, 12)
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
  let header = ''
  let spec = ''
  let multi = false
  let minutos = 30
  let json = false
  let stdin = false
  const opcoes: Opcao[] = []

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-o' || a === '--opcao') opcoes.push(parseOpcao(argv[++i] ?? ''))
    else if (a === '-H' || a === '--header') header = argv[++i] ?? ''
    else if (a === '-m' || a === '--multi') multi = true
    else if (a === '--spec') spec = argv[++i] ?? ''
    else if (a === '-t' || a === '--minutos') minutos = Number(argv[++i])
    else if (a === '--json') json = true
    else if (a === '-') stdin = true
    else if (a === '-h' || a === '--help') return (console.log(USO), 0)
    else if (!pergunta) pergunta = a
  }

  if (!Number.isFinite(minutos) || minutos <= 0) return morre(`-t ${minutos}: minutos tem que ser > 0`)

  let perguntas: Pergunta[]
  if (stdin || spec) {
    try {
      const bruto = spec || (await Bun.stdin.text())
      const d = JSON.parse(bruto)
      perguntas = Array.isArray(d) ? d : d.perguntas
      if (!Array.isArray(perguntas)) throw new Error('esperava `perguntas: []`')
    } catch (e) {
      return morre(`spec inválida: ${(e as Error).message}\n\n${USO}`)
    }
  } else {
    if (!pergunta.trim()) return morre(USO)
    // As duas recusas da forma curta acontecem aqui pra não gastar uma ida na
    // rede; o servidor recusa de novo, porque é a fronteira que TODO cliente
    // atravessa.
    if (opcoes.length < 2)
      return morre(`${opcoes.length} opção(ões): uma escolha precisa de duas.\n  -o "faz|o que acontece" -o "espera|o que acontece"`)
    perguntas = [{ question: pergunta, header: header || headerDerivado(pergunta), options: opcoes, multiSelect: multi }]
  }

  // A ORIGEM não é enfeite: pergunta sem dono é decisão tomada sobre um contexto
  // que quem responde não consegue reconstruir.
  const origem = {
    agente: process.env.ASKUSER_AGENT,
    pane: process.env.ASKUSER_PANE ?? process.env.HERDR_PANE_ID,
    run: process.env.ASKUSER_RUN,
    host: process.env.HOSTNAME ?? process.env.HOST,
  }

  // O APP SOBE SOZINHO. Um agente num pane que ninguém olha não tem quem execute
  // um "suba o servidor antes" — e enquanto o app fora do ar fosse a causa mais
  // provável de `1`, essa saída não distinguia nada.
  const falha = await garanteApp()
  if (falha) return morre(`não consegui garantir o app em ${APP}\n  ${falha}`)

  let id: string
  try {
    id = ((await api('POST', { perguntas, origem, vidaMs: minutos * 60_000 })) as { id: string }).id
  } catch (e) {
    // "NÃO CONSEGUI PERGUNTAR" sai diferente de "perguntei e ninguém respondeu".
    // Sem essa distinção, um app fora do ar vira decisão fantasma.
    return morre(`não consegui abrir a rodada em ${APP}\n  ${(e as Error).message}`)
  }

  // A JANELA sobe DEPOIS da rodada existir, senão ela abriria em "nada pendente"
  // e a pessoa veria a pergunta aparecer sozinha meio segundo depois.
  //
  // `ASKUSER_NO_WINDOW` existe pro caso sem tela — CI, máquina remota, e o
  // próprio teste desta borda. Perguntar continua funcionando: a janela é
  // superfície, e o navegador serve a mesma tela.
  //
  // A ALTURA sai da RODADA, não de um número fixo: a janela de 460 fixos abria
  // uma rodada de duas perguntas com `confirmar` fora da tela.
  const janela = process.env.ASKUSER_NO_WINDOW
    ? null
    : await abreJanela({ height: alturaPara(perguntas) }).catch(() => null)

  // POLLING de 1s. O processo já está bloqueado; um segundo é imperceptível pra
  // quem decide. O VENCIMENTO não depende de nada rodando: `expiraEm` está
  // gravado e o servidor avalia na LEITURA.
  for (;;) {
    const r = (await api('GET', undefined, `?id=${id}`)) as {
      estado: string
      respostas?: Record<string, { escolhas: string[]; outro?: string; anotacao?: string }>
    }
    if (r.estado !== 'OPEN') {
      // A janela FECHA com a decisão. Ela sobe por pergunta e morre com ela —
      // deixá-la viva depois seria um retângulo por cima de tudo sem nada dentro.
      janela?.kill()
      const saida ={ id, estado: r.estado, respostas: r.respostas ?? {}, pulou: r.estado === 'SKIPPED', expirou: r.estado === 'EXPIRED' }
      if (json) console.log(JSON.stringify(saida))
      else if (r.estado === 'ANSWERED')
        for (const [q, resp] of Object.entries(saida.respostas))
          console.log(`${q}: ${[...resp.escolhas, resp.outro].filter(Boolean).join(', ')}${resp.anotacao ? ` — ${resp.anotacao}` : ''}`)
      else console.log(r.estado.toLowerCase())
      return r.estado === 'ANSWERED' ? 0 : r.estado === 'SKIPPED' ? 2 : 3
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
}

if (import.meta.main) process.exit(await main(Bun.argv.slice(2)))
