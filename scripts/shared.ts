//! O encanamento da janela. Quem usa isto é `askuser.ts`, e só ele.
//!
//! **Os TIPOS não moram aqui** — eles são o contrato, e contrato mora no arquivo
//! que alguém abre pra saber o que pedir (`askuser.ts`). Aqui fica só COMO, e é
//! por isso que o outline de lá lê como uma API e o de cá como uma oficina.

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
