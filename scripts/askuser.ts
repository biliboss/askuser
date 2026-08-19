#!/usr/bin/env bun
//! A JANELA — o contrato inteiro, tipado, e um método que o executa.
//!
//! Os tipos moram AQUI de propósito: o outline deste arquivo é o contrato. Quem
//! abre não deveria precisar ler implementação pra saber o que dá pra pedir. O
//! encanamento — config derivada, download de binário — está em `shared.ts`.
//!
//! ## O que ela é
//!
//! Uma janela nativa que carrega **a mesma tela** que o navegador carrega. Sem
//! frontend próprio, deliberadamente: duplicar a tela criaria uma segunda verdade
//! que diverge na primeira edição. O que ela acrescenta é a única coisa que um
//! navegador não dá — **atravessar o que estiver na frente**.
//!
//! O projeto existe porque pergunta que espera onde ninguém olha é
//! indistinguível de trabalho em andamento (`CLAUDE.md`). Uma aba atrás de outras
//! quinze é esse problema de volta.
//!
//! ## Por que Neutralino — medido em 19/08, nesta máquina
//!
//! | | custo |
//! |---|---|
//! | Tauri | toolchain Rust · `cargo build` ~1 min · `target/` ~1GB |
//! | Electrobun | `node_modules` de **107M** |
//! | Neutralino | binário de **~2MB**, baixado uma vez |
//!
//! A tese do projeto é "uma peça, sem dependência pesada". Os dois primeiros
//! contradiziam a tese pra entregar uma janela.

import { APP, binarioDaMaquina, escreveConfig, garanteBinarios } from './shared.ts'

// ─── O CONTRATO ────────────────────────────────────────────────────────────────

/** A tela que a janela abre. Absoluta, com esquema. */
export type Url = `http://${string}` | `https://${string}`

/** Largura e altura em pixels. Separado de `Opcoes` porque as duas andam juntas. */
export type Tamanho = {
  /** padrão 560 */
  width: number
  /** padrão 460 */
  height: number
}

/**
 * Tudo que `askuser()` aceita. **Nenhum campo é obrigatório** — a chamada vazia
 * é a correta no caso comum (janela por cima, na máquina local).
 */
export type Opcoes = Partial<Tamanho> & {
  /** Padrão: `ASKUSER_URL`, ou `http://127.0.0.1:5311`. */
  url?: Url
  /**
   * Padrão `true`, e é o motivo desta janela existir.
   *
   * `false` entrega uma janela comum — serve pra deixar aberta o dia todo num
   * monitor lateral, onde roubar foco atrapalharia mais do que ajuda.
   */
  alwaysOnTop?: boolean
  /**
   * Padrão `false`: **com a moldura do sistema**.
   *
   * Foi testado sem (19/08) e voltou. Sem barra a janela fica bonita e fica
   * PRESA: não há como arrastá-la, porque a tela é servida pelo Next e não pelo
   * Neutralino — não existe `-webkit-app-region: drag` aqui, e mover a janela
   * pediria a API nativa, que está desligada de propósito. Uma janela que sobe
   * por cima e não sai do lugar é pior que uma barra de título feia.
   *
   * `true` tira a moldura. Serve pra quiosque, ou pra uma tela que ninguém
   * precisa mover.
   */
  borderless?: boolean
}

/** O processo do Neutralino. `kill()` fecha a janela; `exited` é a promessa do fim. */
export type Janela = ReturnType<typeof Bun.spawn>

/** O que impede a janela de subir. Um só hoje, e ele é de rede. */
export type Falha = 'binarios-nao-baixaram'

// ─── O MÉTODO ──────────────────────────────────────────────────────────────────

/**
 * Sobe a janela e devolve o processo.
 *
 * **NÃO espera.** Quem chama decide se guarda o processo pra matar depois ou se
 * deixa a janela viver. Bloquear aqui seria a janela virando peça do caminho, e
 * ela é superfície: o app funciona sem ela, o CLI funciona sem ela, e ela cair
 * não impede ninguém de perguntar nem de responder.
 *
 * Levanta com `Falha` quando os binários não baixaram — é a única coisa que
 * precisa de rede, e acontece uma vez só.
 *
 * ```ts
 * const j = await askuser()                     // por cima, local
 * j.kill()                                      // fecha
 *
 * await askuser({ alwaysOnTop: false })         // aberta o dia todo, sem roubar foco
 * await askuser({ width: 900, height: 700 })
 * await askuser({ url: 'http://192.168.0.9:5311' })   // o app é de outra máquina
 * ```
 */
export async function askuser(opcoes: Opcoes = {}): Promise<Janela> {
  escreveConfig(opcoes)
  const erro = await garanteBinarios()
  if (erro) throw new Error(`askuser: binarios-nao-baixaram — ${erro}`)
  // O BINÁRIO, não `neu run`: o wrapper escrevia log no stdout de quem chamou e
  // sobrevivia ao `kill()` deixando a janela na tela. `binarioDaMaquina()` conta
  // as duas provas.
  //
  // `stdout: 'ignore'` porque quem chama isto pode estar imprimindo JSON — e a
  // janela não tem nada a dizer que valha sujar a saída de alguém.
  return Bun.spawn([binarioDaMaquina(), '--load-dir-res', '--path=.'], {
    cwd: APP,
    stdout: 'ignore',
    stderr: 'inherit',
  })
}

/**
 * `bun scripts/askuser.ts` — abre a janela e vive junto com ela.
 *
 * `SIGINT` fecha as duas: sem isto o `neu` fica órfão e a próxima chamada abre
 * uma segunda janela sobre a primeira.
 */
if (import.meta.main) {
  const janela = await askuser()
  process.on('SIGINT', () => (janela.kill(), process.exit(0)))
  process.exit(await janela.exited)
}
