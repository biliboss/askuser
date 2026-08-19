//! O encanamento. A janela (`askuser.ts`) e o CLI (`cli/askuser.ts`) usam.
//!
//! **Os TIPOS não moram aqui** — eles são o contrato, e contrato mora no arquivo
//! que alguém abre pra saber o que pedir (`askuser.ts`). Aqui fica só COMO, e é
//! por isso que o outline de lá lê como uma API e o de cá como uma oficina.
//!
//! Duas oficinas, e elas não se conhecem: a de CIMA sobe a janela nativa, a de
//! BAIXO garante que o app HTTP existe pra alguém perguntar.

import type { Opcoes } from './askuser.ts'

/** O bastante da pergunta pra dimensionar a janela. O contrato inteiro é do app. */
export type Pergunta = { options: { preview?: string }[]; layout?: 'lista' | 'grid' }
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** A tela que a janela abre. Env primeiro: a máquina que MOSTRA não é sempre a que serve. */
export const URL_PADRAO = process.env.ASKUSER_URL ?? 'http://127.0.0.1:5311'

/** Onde a config e os ~2MB de binário do Neutralino vivem. Fora do git — é cache. */
export const APP = join(import.meta.dir, '.desktop')

/**
 * A config, DERIVADA das opções e reescrita a cada chamada.
 *
 * Não é arquivo pra alguém editar: é saída. Um `neutralino.config.json`
 * versionado convidaria a mexer nele à mão, e daí existiriam duas verdades sobre
 * qual URL a janela abre.
 *
 * `enableServer: false` porque a janela carrega URL REMOTA — servidor de arquivo
 * estático aqui não serve nada e só abre porta.
 *
 * TODO CAMPO NUMÉRICO VAI EXPLÍCITO, inclusive `port: 0`. Omitir um deles não dá
 * default: o binário morre em `libc++abi: type must be number, but is null`, uma
 * exceção de C++ que não nomeia o campo. Medido em 19/08 — a janela abria e
 * fechava no mesmo instante, sem log útil.
 */
export function escreveConfig(o: Opcoes): void {
  mkdirSync(APP, { recursive: true })
  writeFileSync(
    join(APP, 'neutralino.config.json'),
    JSON.stringify(
      {
        applicationId: 'br.com.biliboss.askuser',
        version: '0.1.0',
        defaultMode: 'window',
        port: 0,
        url: o.url ?? URL_PADRAO,
        enableServer: false,
        enableNativeAPI: false,
        tokenSecurity: 'one-time',
        logging: { enabled: false, writeToLogFile: false },
        nativeAllowList: [],
        modes: {
          window: {
            title: 'askuser',
            width: o.width ?? 560,
            height: o.height ?? 460,
            minWidth: 360,
            minHeight: 280,
            center: true,
            // TELA CHEIA por padrão. O custo no macOS é um Space novo — a janela
            // sai de cima do que a pessoa fazia e voltar pede um swipe. Escolhido
            // com esse custo na mesa: uma pergunta merece a tela inteira, e meia
            // comparação de nove é uma comparação que não aconteceu.
            fullScreen: o.fullScreen ?? true,
            // ALWAYS ON TOP é o motivo desta janela existir. Sem isto ela é uma
            // aba de navegador com bordas diferentes.
            alwaysOnTop: o.alwaysOnTop ?? true,
            enableInspector: false,
            // COM a moldura do sistema. Testado sem, em 19/08, e voltou: sem
            // barra a janela não tem por onde ser arrastada — a tela vem do Next
            // e não do Neutralino, então não existe `-webkit-app-region: drag`
            // aqui, e mover pediria a API nativa, que está desligada de
            // propósito. Janela que sobe por cima e não sai do lugar é pior que
            // uma barra de título feia.
            borderless: o.borderless ?? false,
            maximize: false,
            hidden: false,
            resizable: true,
            // Fechar a janela mata o processo. Sem isto o `neu` fica órfão e a
            // próxima chamada abre uma segunda janela sobre a primeira.
            exitProcessOnClose: true,
          },
        },
        cli: { binaryName: 'askuser', resourcesPath: '/', clientLibrary: '' },
      },
      null,
      2,
    ),
  )
}

/**
 * A ALTURA que a rodada precisa, em pixels. **Medida com o qa-drive em 19/08**,
 * não estimada.
 *
 * A janela nasceu com 460 fixos, e a régua mostrou o custo — empilhando as
 * perguntas numa coluna, o card crescia 421px por pergunta (506 · 927 · 1348 ·
 * 1769). Uma rodada de duas já abria com `confirmar` e `pular` fora da tela: 4
 * dos 9 botões visíveis.
 *
 * **A soma morreu junto com o empilhamento.** Com uma pergunta em foco e as
 * outras na lista lateral, a altura é a da MAIOR pergunta — quatro perguntas
 * custam o mesmo que a mais alta delas. É a razão de layout que mais economiza
 * tela aqui, e por isso o cálculo é `max`, não `reduce`.
 *
 * O teto de 900 fica de pé pro caso extremo (4 opções longas com `preview`), e
 * ali a pergunta rola dentro do card. Rolar é melhor que uma janela maior que a
 * tela, que não dá pra arrastar de volta.
 */
/**
 * A LARGURA. 560 serve pra uma coluna de opções; uma grid 3×3 de diagramas nela
 * daria cartões de 150px, e comparar o que não dá pra ver não é comparar.
 *
 * O teto de 1200 é a tela: acima disso a janela passa de um laptop, e uma janela
 * maior que a tela não dá pra arrastar de volta.
 */
export function larguraPara(perguntas: Pergunta[]): number {
  const colunas = Math.max(
    1,
    ...perguntas.map((p) => (p.layout === 'grid' ? Math.min(3, Math.ceil(Math.sqrt(p.options.length))) : 1)),
  )
  // 128 é a lista lateral, e ela só existe com 2+ perguntas — com uma, esses
  // pixels não são pedidos. 280 por coluna é o menor cartão em que um diagrama
  // de 3-4 nós ainda se lê.
  const lista = perguntas.length > 1 ? 128 + 20 : 0
  return colunas === 1 ? 560 : Math.min(1200, lista + 40 + 280 * colunas)
}

export function alturaPara(perguntas: Pergunta[]): number {
  // Régua de 19/08 no layout com foco: 1 pergunta com 2/3/4 opções (label +
  // description) mediu 491 / 569 / 647 de página. Reta perfeita — 78 por opção,
  // 335 de moldura (origem, prazo, enunciado, os dois campos livres, os botões).
  const alturaDe = (p: Pergunta) =>
    // GRID: as opções não empilham — o que soma é a LINHA. Cada linha é o cartão
    // (preview de 160 + legenda) mais o vão.
    p.layout === 'grid'
      ? 300 + 265 * Math.ceil(p.options.length / Math.min(3, Math.ceil(Math.sqrt(p.options.length))))
      : 335 +
    78 * p.options.length +
    // PREVIEW é a única coisa que o número de opções não prevê: um diagrama
    // mermaid ocupa o que ocupa. 200 por opção com preview é o suficiente pros
    // desenhos de 3-4 nós que cabem numa decisão; maior que isso, rola.
    200 * p.options.filter((o) => o.preview).length

  // A lista lateral não soma — ela é mais curta que qualquer pergunta. E as
  // perguntas não somam entre si: só uma fica em foco.
  return Math.min(900, Math.max(...perguntas.map(alturaDe)))
}

/**
 * O binário desta máquina, dentro de `.desktop/bin/`.
 *
 * Rodar o binário DIRETO, e não `neu run`, custou duas provas em 19/08:
 *
 * 1. o wrapper escreve `neu: INFO Starting process:` no **stdout** — e o stdout
 *    do CLI é JSON que alguém parseia. Uma linha de log ali quebra o chamador.
 * 2. `kill()` no wrapper deixa a janela viva: quem desenha é o filho, e ele
 *    sobrevive ao pai. A janela ficava por cima de tudo depois da decisão.
 *
 * Sem o wrapper somem os dois, mais um processo `node` por pergunta.
 */
export function binarioDaMaquina(): string {
  const arq =
    process.platform === 'win32'
      ? 'neutralino-win_x64.exe'
      : `neutralino-${process.platform === 'darwin' ? 'mac' : 'linux'}_${process.arch === 'arm64' ? 'arm64' : 'x64'}`
  return join(APP, 'bin', arq)
}

/**
 * Baixa os binários do Neutralino na primeira vez, e só na primeira.
 *
 * São ~2MB e ficam em `.desktop/bin/`. Rodar `neu update` a cada chamada
 * gastaria uma ida na rede pra abrir uma janela — e a janela existe justamente
 * pra ser mais rápida que abrir o navegador e procurar a aba.
 *
 * Devolve a mensagem de erro, ou `null` quando deu certo.
 */
export async function garanteBinarios(): Promise<string | null> {
  if (existsSync(join(APP, 'bin'))) return null
  const r = Bun.spawnSync(['bunx', '--bun', '@neutralinojs/neu', 'update'], { cwd: APP, stdout: 'pipe', stderr: 'pipe' })
  if (r.exitCode !== 0) return r.stderr.toString().trim() || 'falhou baixar os binários do Neutralino'
  return null
}

// ─── O APP HTTP ────────────────────────────────────────────────────────────────

/** Onde o Next mora. */
export const UI = join(import.meta.dir, 'ui')

/** O app respondeu? Timeout curto: isto roda ANTES de toda pergunta. */
export async function vivo(ms = 800): Promise<boolean> {
  try {
    await fetch(`${URL_PADRAO}/api/questions`, { signal: AbortSignal.timeout(ms) })
    return true
  } catch {
    return false
  }
}

/**
 * Garante o app de pé, subindo o Next DESTACADO se preciso. `null` = pode
 * perguntar.
 *
 * ## Por que isto existe
 *
 * Antes, perguntar com o app fora do ar saía `1` com "o app está de pé? `cd
 * scripts/ui && bun run start`" — um passo manual entre o agente e a pergunta.
 * Um agente num pane que ninguém olha não tem quem execute esse passo, e o `1`
 * dele é indistinguível de "não consegui perguntar" por qualquer outro motivo.
 *
 * Fechando esta causa, **`1` volta a ser sinal**.
 *
 * ## DESTACADO, e é a palavra que importa
 *
 * `detached` + `unref()`: o servidor não morre junto com o script que perguntou.
 * Preso ao processo, a segunda pergunta pagaria o boot de novo — e a tela sumiria
 * entre uma decisão e outra.
 *
 * Sem supervisor, sem pidfile, sem `status`: morreu, a próxima pergunta sobe
 * outro. Um supervisor seria mais código pra manter do que o problema que evita.
 */
export async function garanteApp(): Promise<string | null> {
  if (await vivo()) return null

  // TRAVA ENTRE PROCESSOS antes de subir nada. Duas perguntas disparadas ao mesmo
  // tempo veem "não responde" no mesmo instante e sobem DOIS Next; o segundo
  // morre no lock do RocksDB com "IO error: While lock file: … Resource
  // temporarily unavailable" — uma mensagem que não diz nada sobre a causa.
  // Medido em 19/08, e o custo é o pior: a pergunta simplesmente não acontece.
  //
  // `wx` é a trava: criar falha se o arquivo existe, e isso é atômico no
  // sistema de arquivos. Quem perde a corrida não sobe nada — só espera o
  // vencedor responder, que é o que ele queria desde o começo.
  const trava = join(APP, 'subindo.lock')
  let euSubo = false
  try {
    mkdirSync(APP, { recursive: true })
    writeFileSync(trava, String(process.pid), { flag: 'wx' })
    euSubo = true
  } catch {
    // Trava de um processo que MORREU no meio ficaria pra sempre, e aí ninguém
    // sobe o app nunca mais. Meio minuto é mais que o dobro do boot medido.
    const idade = Date.now() - (statSync(trava, { throwIfNoEntry: false })?.mtimeMs ?? 0)
    if (idade > 30_000) {
      rmSync(trava, { force: true })
      return garanteApp()
    }
  }

  if (!euSubo) {
    for (let i = 0; i < 60; i++) {
      if (await vivo(500)) return null
      await Bun.sleep(500)
    }
    return `outro processo está subindo o app e ele não respondeu em 30s`
  }

  try {
    return await sobeApp()
  } finally {
    rmSync(trava, { force: true })
  }
}

/** Sobe o Next e espera responder. Só é chamado por quem ganhou a trava. */
async function sobeApp(): Promise<string | null> {

  // `next start` EXIGE um build. Sem isto ele sai na hora e a espera abaixo
  // gastaria os 30s inteiros pra reportar um timeout que na verdade é "faltou
  // buildar" — a mensagem errada sobre a causa certa.
  if (!existsSync(join(UI, '.next', 'BUILD_ID'))) {
    const b = Bun.spawnSync(['bun', 'run', 'build'], { cwd: UI, stdout: 'pipe', stderr: 'pipe' })
    if (b.exitCode !== 0) return `o build do app falhou\n${b.stderr.toString().trim()}`
  }

  Bun.spawn(['bun', 'run', 'start'], {
    cwd: UI,
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
    detached: true,
  }).unref()

  for (let i = 0; i < 60; i++) {
    if (await vivo(500)) return null
    await Bun.sleep(500)
  }
  return `o app subiu mas não respondeu em ${URL_PADRAO} depois de 30s`
}
