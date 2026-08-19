//! O banco: RocksDB embutido no processo do Next. Sem serviço, sem Docker.
//!
//! ## Por que embutido e não um serviço
//!
//! A versão anterior tinha Convex (Docker) e Inngest (binário). Três processos
//! pra uma pergunta existir, e a consequência é dura: se qualquer um estivesse
//! fora, o agente não perguntava. Aqui o banco é uma pasta no disco e vive
//! dentro do mesmo processo que serve a tela — se o Next está de pé, perguntar
//! funciona. Não há segunda peça pra estar fora.
//!
//! ## O tempo, sem workflow durável
//!
//! O Inngest existia pra uma coisa: expirar pergunta que ninguém respondeu. O
//! argumento contra `setTimeout` era real — o timer morre com o processo, e as
//! perguntas ficariam abertas pra sempre.
//!
//! A resposta aqui não é um timer melhor: é NÃO DEPENDER de timer. `expiraEm`
//! está gravado, e `listOpen` trata como expirada toda pergunta cujo prazo já
//! passou, no momento da leitura. O estado no disco é a verdade; o varredor
//! abaixo só materializa isso pra quem espera. Reiniciar o processo não perde
//! nada, porque não havia nada em memória pra perder.
//!
//! ## `getRange` e a chave
//!
//! `q:<criadaEm>:<rand>` — o prefixo dá o range, e o timestamp na chave dá a
//! ORDEM sem índice secundário. RocksDB é ordenado por chave, e é isso que
//! substitui o `index('por_estado')` que o Convex tinha: a varredura lê tudo do
//! prefixo e filtra em memória, o que é barato enquanto "aberto" for dezenas.
//! Se um dia for milhares, a saída é um segundo prefixo `open:` mantido junto —
//! e aí é escrita dupla, que é o custo que ainda não se paga.

import { RocksDatabase } from '@harperfast/rocksdb-js'
import { EventEmitter } from 'node:events'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export type Estado = 'OPEN' | 'ANSWERED' | 'SKIPPED' | 'EXPIRED'

export type Opcao = { rotulo: string; descricao?: string }

export type Origem = { agente?: string; pane?: string; run?: string; host?: string }

export type Pergunta = {
  id: string
  texto: string
  opcoes: Opcao[]
  origem: Origem
  estado: Estado
  resposta?: { indice: number; escolha: string; em: number }
  criadaEm: number
  expiraEm: number
}

const CAMINHO = process.env.ASKUSER_DB ?? join(process.cwd(), '.data', 'askuser')

// UM banco por processo. O Next recarrega módulos em dev, e abrir o RocksDB
// duas vezes na mesma pasta dá lock — o global sobrevive ao hot reload.
declare global {
  var __aqdb: RocksDatabase | undefined
  var __aqbus: EventEmitter | undefined
}

/**
 * PREGUIÇOSO, e isso não é otimização: é o que faz o build passar.
 *
 * Com `RocksDatabase.open()` no corpo do módulo, o `next build` abria o banco
 * durante a coleta de dados das páginas — e falhava, porque build não tem por
 * que tocar em banco nenhum. Medido em 19/08: `Failed to collect page data for
 * /api/stream`, com um erro de I/O que não dizia nada sobre build.
 *
 * E o RocksDB NÃO cria o diretório pai: ele faz `mkdir` só da última pasta, e
 * `.data/askuser` sem `.data` existindo vira `No such file or directory`.
 */
export function abre(): RocksDatabase {
  if (!globalThis.__aqdb) {
    mkdirSync(CAMINHO, { recursive: true })
    globalThis.__aqdb = RocksDatabase.open(CAMINHO)
  }
  return globalThis.__aqdb
}

/** O barramento local. Uma tela ouve aqui via SSE; nada sai do processo. */
export const bus: EventEmitter = (globalThis.__aqbus ??= new EventEmitter().setMaxListeners(0))

const chave = (p: Pergunta) => `q:${p.criadaEm}:${p.id}`

/** Quatro estados, e o vencido conta como EXPIRED mesmo sem ninguém ter escrito. */
function comPrazo(p: Pergunta, agora: number): Pergunta {
  return p.estado === 'OPEN' && p.expiraEm <= agora ? { ...p, estado: 'EXPIRED' } : p
}

function todas(): Pergunta[] {
  return [...abre().getRange({ start: 'q:', end: 'q:\uffff' })].map((e: any) => e.value as Pergunta)
}

export function byId(id: string): Pergunta | undefined {
  const agora = Date.now()
  const p = todas().find((x) => x.id === id)
  return p && comPrazo(p, agora)
}

export function listOpen(): Pergunta[] {
  const agora = Date.now()
  return todas()
    .map((p) => comPrazo(p, agora))
    .filter((p) => p.estado === 'OPEN')
    .sort((a, b) => b.criadaEm - a.criadaEm)
}

export async function ask(args: {
  texto: string
  opcoes: Opcao[]
  origem: Origem
  vidaMs?: number
}): Promise<Pergunta> {
  // AS DUAS RECUSAS moram aqui porque este é o ponto que TODO cliente atravessa
  // — o CLI, a rota HTTP, e o que vier depois. Uma pergunta com uma opção só é
  // um `enter` disfarçado de decisão, e ela interrompe alguém pra nada.
  if (!args.texto.trim()) throw new Error('pergunta vazia')
  if (args.opcoes.length < 2)
    throw new Error(`${args.opcoes.length} opção(ões): uma escolha precisa de duas`)

  const agora = Date.now()
  const p: Pergunta = {
    id: crypto.randomUUID(),
    texto: args.texto,
    opcoes: args.opcoes,
    origem: args.origem,
    estado: 'OPEN',
    criadaEm: agora,
    expiraEm: agora + (args.vidaMs ?? 30 * 60_000),
  }
  await abre().put(chave(p), p)
  bus.emit('mudou')
  return p
}

/**
 * Fecha uma pergunta UMA vez. Devolve `false` quando ela já estava fechada.
 *
 * É o guard inteiro do sistema: dois cliques, ou o varredor expirando no mesmo
 * instante em que alguém responde, produziriam dois desfechos pro mesmo id — e
 * quem espera leria o último que chegou. Expirar contra uma resposta PERDE, e
 * perder é o certo: houve gente.
 */
async function fecha(id: string, patch: Partial<Pergunta>): Promise<boolean> {
  const agora = Date.now()
  const p = todas().find((x) => x.id === id)
  if (!p || p.estado !== 'OPEN') return false
  // Vencida já não aceita resposta: quem clicou está decidindo sobre um estado
  // que o prazo fechou, e é exatamente a decisão tarde que este app evita.
  if (patch.estado !== 'EXPIRED' && p.expiraEm <= agora) return false
  await abre().put(chave(p), { ...p, ...patch })
  bus.emit('mudou')
  return true
}

export async function answer(id: string, indice: number): Promise<boolean> {
  const p = todas().find((x) => x.id === id)
  if (!p) throw new Error('pergunta não existe')
  // ÍNDICE FORA DA FAIXA é erro, não resposta esquisita: aceitar gravaria uma
  // `escolha` vazia que quem espera leria como decisão tomada.
  if (indice < 0 || indice >= p.opcoes.length)
    throw new Error(`índice ${indice} fora das ${p.opcoes.length} opções`)
  return await fecha(id, {
    estado: 'ANSWERED',
    resposta: { indice, escolha: p.opcoes[indice].rotulo, em: Date.now() },
  })
}

/** Pular é ESTADO, não `resposta` vazia — "não quis decidir" ≠ "escolheu a 0". */
export const skip = (id: string) => fecha(id, { estado: 'SKIPPED' })

/**
 * Materializa no disco o que a leitura já considerava vencido.
 *
 * Não é o relógio do sistema — o relógio é o `expiraEm` gravado, e ele vale
 * mesmo com este varredor parado. Isto existe só pra a linha no disco não
 * mentir pra quem for ler o histórico depois, e pra o `bus` avisar as telas.
 */
export async function varreVencidas(): Promise<number> {
  const agora = Date.now()
  const vencidas = todas().filter((p) => p.estado === 'OPEN' && p.expiraEm <= agora)
  for (const p of vencidas) await fecha(p.id, { estado: 'EXPIRED' })
  return vencidas.length
}
