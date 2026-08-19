//! O banco: RocksDB embutido no processo do Next. Sem serviço, sem Docker.
//!
//! ## A unidade é a RODADA, não a pergunta
//!
//! Uma chamada carrega de 1 a 4 perguntas, e elas são respondidas JUNTAS. Isso é
//! do contrato do `AskUserQuestion` e não é detalhe: quem interrompe alguém
//! deveria gastar a interrupção inteira de uma vez, não quatro vezes seguidas.
//!
//! A consequência de forma: o registro no disco é a rodada. `estado`, `expiraEm`
//! e `origem` são DELA — as quatro perguntas vencem juntas, e não existe rodada
//! meio respondida. Fazer isso depois de ter dados no disco custaria migração, e
//! é por isso que veio antes de qualquer outra coisa.
//!
//! ## Por que embutido e não um serviço
//!
//! A versão anterior tinha Convex (Docker) e Inngest (binário). Três processos
//! pra uma pergunta existir, e a consequência é dura: se qualquer um estivesse
//! fora, o agente não perguntava. Aqui o banco é uma pasta no disco e vive
//! dentro do mesmo processo que serve a tela.
//!
//! ## O tempo, sem workflow durável
//!
//! `expiraEm` está gravado, e `listOpen` trata como expirada toda rodada cujo
//! prazo já passou, no momento da LEITURA. O estado no disco é a verdade; o
//! varredor abaixo só materializa isso. Reiniciar o processo não perde nada,
//! porque não havia nada em memória pra perder.

import { RocksDatabase } from '@harperfast/rocksdb-js'
import { EventEmitter } from 'node:events'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// ─── O CONTRATO ────────────────────────────────────────────────────────────────

/** Uma opção. `preview` é markdown monoespaçado, mostrado lado a lado. */
export type Opcao = {
  /** 1-5 palavras. É o que a pessoa clica. */
  label: string
  /** A CONSEQUÊNCIA de escolher, não o sinônimo do label. */
  description?: string
  /** Mockup, snippet, diagrama. Só em pergunta de escolha única. */
  preview?: string
}

export type Pergunta = {
  /** A pergunta inteira, como o humano vai ler. */
  question: string
  /** O chip que rotula a pergunta na tela. Até 12 caracteres. */
  header: string
  /**
   * O que está em jogo, em **até 7 palavras**. Aparece na lista lateral, embaixo
   * do `header`.
   *
   * Ela existe porque o `header` sozinho é curto demais pra dizer o que a
   * pergunta decide: "banco" não conta que a escolha é de dependência. Sete
   * palavras é o teto e não é arbitrário — é o que cabe numa linha da lista sem
   * quebrar, e a lista deixa de ser escaneável no instante em que um item vira
   * duas linhas.
   */
  description?: string
  /** 2 a 4. Menos é `enter` disfarçado; mais é a pessoa lendo em vez de decidir. */
  options: Opcao[]
  /** `true` quando as opções não são mutuamente exclusivas. */
  multiSelect?: boolean
}

/** O que a pessoa devolveu numa pergunta. */
export type Resposta = {
  /** Os `label` escolhidos. Um só quando `multiSelect` é falso. */
  escolhas: string[]
  /** O texto livre do "Other" — a saída que TODA pergunta tem, sem ninguém pedir. */
  outro?: string
  /** O que ela escreveu ALÉM de escolher. */
  anotacao?: string
}

export type Estado = 'OPEN' | 'ANSWERED' | 'SKIPPED' | 'EXPIRED'

export type Origem = { agente?: string; pane?: string; run?: string; host?: string }

export type Rodada = {
  id: string
  perguntas: Pergunta[]
  origem: Origem
  estado: Estado
  /** Endereçado pelo TEXTO da pergunta, igual ao `AskUserQuestion`. */
  respostas?: Record<string, Resposta>
  criadaEm: number
  expiraEm: number
}

/** Os tetos do contrato. Não são sugestão: `abre()` recusa fora deles. */
export const LIMITES = { perguntas: 4, opcoes: 4, header: 12, palavrasDaDescricao: 7 } as const

// ─── O BANCO ───────────────────────────────────────────────────────────────────

const CAMINHO = process.env.ASKUSER_DB ?? join(process.cwd(), '.data', 'askuser')

declare global {
  var __aqdb: RocksDatabase | undefined
  var __aqbus: EventEmitter | undefined
}

/**
 * PREGUIÇOSO, e isso não é otimização: é o que faz o build passar.
 *
 * Com `RocksDatabase.open()` no corpo do módulo, o `next build` abria o banco
 * durante a coleta de dados das páginas e falhava com um erro de I/O que não
 * dizia nada sobre build. E o RocksDB NÃO cria o diretório pai.
 */
export function db(): RocksDatabase {
  if (!globalThis.__aqdb) {
    mkdirSync(CAMINHO, { recursive: true })
    globalThis.__aqdb = RocksDatabase.open(CAMINHO)
  }
  return globalThis.__aqdb
}

/** O barramento local. A tela ouve por SSE; nada sai do processo. */
export const bus: EventEmitter = (globalThis.__aqbus ??= new EventEmitter().setMaxListeners(0))

/** `r:<criadaEm>:<id>` — o prefixo dá o range, o timestamp dá a ORDEM sem índice. */
const chave = (r: Rodada) => `r:${r.criadaEm}:${r.id}`

function todas(): Rodada[] {
  return [...db().getRange({ start: 'r:', end: 'r:\uffff' })].map((e: any) => e.value as Rodada)
}

/** Vencida conta como EXPIRED mesmo sem ninguém ter escrito. */
const comPrazo = (r: Rodada, agora: number): Rodada =>
  r.estado === 'OPEN' && r.expiraEm <= agora ? { ...r, estado: 'EXPIRED' } : r

export function byId(id: string): Rodada | undefined {
  const r = todas().find((x) => x.id === id)
  return r && comPrazo(r, Date.now())
}

export function listOpen(): Rodada[] {
  const agora = Date.now()
  return todas()
    .map((r) => comPrazo(r, agora))
    .filter((r) => r.estado === 'OPEN')
    .sort((a, b) => b.criadaEm - a.criadaEm)
}

/**
 * As recusas do contrato, e elas moram AQUI porque este é o ponto que todo
 * cliente atravessa — o CLI, a rota, e o que vier depois.
 *
 * Devolve a mensagem, ou `null` quando passa.
 */
export function critica(perguntas: Pergunta[]): string | null {
  if (!perguntas.length) return 'nenhuma pergunta'
  if (perguntas.length > LIMITES.perguntas)
    return `${perguntas.length} perguntas: o teto é ${LIMITES.perguntas} — mais que isso a pessoa lê em vez de decidir`
  for (const p of perguntas) {
    if (!p.question?.trim()) return 'pergunta vazia'
    if (!p.header?.trim()) return `"${p.question}": falta o header`
    if (p.header.length > LIMITES.header)
      return `header "${p.header}" tem ${p.header.length} chars: o teto é ${LIMITES.header}`
    // Recusar em vez de truncar: truncando, quem escreveu não descobre que a
    // frase não coube — descobre quem lê, com a metade que sobrou.
    const palavras = p.description?.trim().split(/\s+/).filter(Boolean).length ?? 0
    if (palavras > LIMITES.palavrasDaDescricao)
      return `"${p.question}": a description tem ${palavras} palavras, o teto é ${LIMITES.palavrasDaDescricao}`
    // DUAS é o piso: uma opção só é um `enter` disfarçado de decisão, e ela
    // interrompe alguém pra nada.
    if (!p.options || p.options.length < 2)
      return `"${p.question}": ${p.options?.length ?? 0} opção(ões) — uma escolha precisa de duas`
    if (p.options.length > LIMITES.opcoes)
      return `"${p.question}": ${p.options.length} opções, o teto é ${LIMITES.opcoes}`
    if (p.options.some((o) => !o.label?.trim())) return `"${p.question}": opção sem label`
    // PREVIEW só em escolha única: o layout lado a lado mostra UM preview por
    // vez, e com múltipla escolha não existe "o preview do que está focado".
    if (p.multiSelect && p.options.some((o) => o.preview))
      return `"${p.question}": preview não vale com multiSelect`
  }
  return null
}

export async function abre(args: {
  perguntas: Pergunta[]
  /** Ausente vira `{}`. Perguntar sem dizer quem é DEVE funcionar — um `curl` é um chamador legítimo. */
  origem?: Origem
  vidaMs?: number
}): Promise<Rodada> {
  const erro = critica(args.perguntas)
  if (erro) throw new Error(erro)

  const agora = Date.now()
  const r: Rodada = {
    id: crypto.randomUUID(),
    perguntas: args.perguntas,
    // NORMALIZA AQUI, e não na tela: `abre()` é por onde todo chamador passa.
    // Medido em 19/08 com o qa-drive — um POST sem `origem` gravava
    // `origem: undefined`, e a tela morria inteira em "Cannot read properties of
    // undefined (reading 'agente')". Não era o card daquela rodada: era a página,
    // com TODAS as outras perguntas dentro dela.
    origem: args.origem ?? {},
    estado: 'OPEN',
    criadaEm: agora,
    expiraEm: agora + (args.vidaMs ?? 30 * 60_000),
  }
  await db().put(chave(r), r)
  bus.emit('mudou')
  return r
}

/**
 * Fecha uma rodada UMA vez. `false` quando ela já estava fechada.
 *
 * É o guard inteiro do sistema: dois cliques, ou o prazo vencendo no mesmo
 * instante em que alguém responde, produziriam dois desfechos pro mesmo id — e
 * quem espera leria o último que chegou. Expirar contra uma resposta PERDE, e
 * perder é o certo: houve gente.
 */
async function fecha(id: string, patch: Partial<Rodada>): Promise<boolean> {
  const agora = Date.now()
  const r = todas().find((x) => x.id === id)
  if (!r || r.estado !== 'OPEN') return false
  if (patch.estado !== 'EXPIRED' && r.expiraEm <= agora) return false
  await db().put(chave(r), { ...r, ...patch })
  bus.emit('mudou')
  return true
}

/**
 * Responde a rodada INTEIRA. Parcial não existe.
 *
 * O contrato é "uma interrupção, N decisões": aceitar três de quatro deixaria a
 * rodada aberta esperando a quarta, e quem chamou não teria como usar as três —
 * ele pediu as quatro porque precisa das quatro.
 */
export async function responde(id: string, respostas: Record<string, Resposta>): Promise<boolean> {
  const r = todas().find((x) => x.id === id)
  if (!r) throw new Error('rodada não existe')

  for (const p of r.perguntas) {
    const resp = respostas[p.question]
    if (!resp) throw new Error(`falta a resposta de "${p.question}"`)
    const tem = resp.escolhas.length > 0 || Boolean(resp.outro?.trim())
    if (!tem) throw new Error(`"${p.question}": nem escolha nem texto livre`)
    if (!p.multiSelect && resp.escolhas.length > 1)
      throw new Error(`"${p.question}": ${resp.escolhas.length} escolhas numa pergunta de escolha única`)
    // Um label que não está nas opções é erro, não resposta esquisita: aceitar
    // gravaria uma escolha que quem chamou não sabe interpretar. Texto livre
    // tem campo próprio (`outro`) justamente pra não passar por aqui.
    const validos = new Set(p.options.map((o) => o.label))
    const invalido = resp.escolhas.find((e) => !validos.has(e))
    if (invalido) throw new Error(`"${p.question}": "${invalido}" não é uma das opções`)
  }
  return await fecha(id, { estado: 'ANSWERED', respostas })
}

/** Pular é ESTADO, não resposta vazia — "não quis decidir" ≠ "escolheu a 1ª". */
export const pula = (id: string) => fecha(id, { estado: 'SKIPPED' })

/**
 * Materializa no disco o que a leitura já considerava vencido.
 *
 * Não é o relógio do sistema — o relógio é o `expiraEm` gravado, e ele vale
 * mesmo com este varredor parado.
 */
export async function varreVencidas(): Promise<number> {
  const agora = Date.now()
  const vencidas = todas().filter((r) => r.estado === 'OPEN' && r.expiraEm <= agora)
  for (const r of vencidas) await fecha(r.id, { estado: 'EXPIRED' })
  return vencidas.length
}
