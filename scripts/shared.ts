//! O encanamento. A janela (`askuser.ts`) e o CLI (`cli/askuser.ts`) usam.
//!
//! **Os TIPOS não moram aqui** — eles são o contrato, e contrato mora no arquivo
//! que alguém abre pra saber o que pedir (`askuser.ts`). Aqui fica só COMO, e é
//! por isso que o outline de lá lê como uma API e o de cá como uma oficina.
//!
//! Duas oficinas, e elas não se conhecem: a de CIMA sobe a janela nativa, a de
//! BAIXO garante que o app HTTP existe pra alguém perguntar.

import type { Opcoes } from './askuser.ts'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
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
            fullScreen: false,
            // ALWAYS ON TOP é o motivo desta janela existir. Sem isto ela é uma
            // aba de navegador com bordas diferentes.
            alwaysOnTop: o.alwaysOnTop ?? true,
            enableInspector: false,
            borderless: false,
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
 * A janela nasceu com 460 fixos, e a régua mostrou o que isso custava:
 *
 * | perguntas (4 opções cada) | card |
 * |---|---|
 * | 1 | 506 |
 * | 2 | 927 |
 * | 3 | 1348 |
 * | 4 | 1769 |
 *
 * Linear: 421 por pergunta — 62 por opção, 173 de moldura (enunciado, "Other",
 * nota, divisor). Com 460 fixos, uma rodada de DUAS perguntas abria com
 * `confirmar` e `pular` fora da tela: 4 dos 9 botões visíveis. A pessoa não vê o
 * que fazer com o que acabou de escolher, e esta janela existe pra ser
 * respondida de primeira.
 *
 * O TETO de 900 é real: quatro perguntas pedem 1769px e nenhuma tela de laptop
 * tem isso sobrando. Passou do teto, a rodada rola — e rolar é melhor que uma
 * janela maior que a tela, que não dá pra arrastar de volta.
 */
export function alturaPara(perguntas: { options: unknown[] }[]): number {
  const conteudo = perguntas.reduce((s, p) => s + 173 + 62 * p.options.length, 0)
  return Math.min(900, 48 + 70 + conteudo + 60)
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
