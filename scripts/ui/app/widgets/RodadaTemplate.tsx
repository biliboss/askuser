'use client'
//! O TEMPLATE da rodada: a lista à esquerda, a pergunta em foco à direita.
//!
//! Ele é quem manda no TAMANHO — a lista tem largura fixa porque é uma coluna de
//! rótulos de 12 chars, e o foco pega o resto. Os dois widgets fluem dentro do
//! que recebem e não sabem quanto medem.
//!
//! ## O que este arquivo decide, e os widgets não
//!
//! - **qual pergunta está em foco** — e por isso os três caminhos que mudam foco
//!   (clicar na lista, `j`/`k`, e escolher numa pergunta de opção única) mexem no
//!   mesmo estado, sem se conhecerem.
//! - **quando dá pra confirmar** — toda pergunta com resposta. Não existe rodada
//!   meio respondida: o servidor recusa, e a tela não deve prometer o que ele
//!   recusa. Até lá o botão principal diz `próxima`, e leva pra pergunta que
//!   falta.
//! - **o desfecho** — `respostas` presente é resposta; ausente é PULO.
//!
//! ## Os atalhos, e por que cada um é o que é
//!
//!   1..4    MARCA a opção na pergunta em foco — e para aí
//!   o dígito SEGUINTE   foca o "outra resposta"
//!   ⏎       vai pra próxima que ainda não tem resposta
//!   j / k   próxima / anterior — as do vim, e a mão já sabe
//!   ⌘N      próxima também, pra quem não pensa em vim
//!   ⌘⏎      confirma, só quando não falta nenhuma
//!   segure esc (3s)   pula
//!
//! **Marcar e avançar são dois gestos.** O dígito marcava e o foco corria junto,
//! e o efeito era o contrário do pretendido: a opção saía da vista no instante
//! em que foi marcada, e quem apertou `2` não via o `2` selecionado.
//!
//! As duas últimas pedem esforço de propósito: são as únicas irreversíveis desta
//! tela. `esc` batido é a tecla que a mão aperta pra fugir, e numa janela que
//! sobe na frente do que você estava fazendo isso descartaria a pergunta sem
//! ninguém decidir nada.

import { Button, Card, CardBody, CardHeader, Chip } from '@heroui/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Resposta, Rodada } from '../../lib/store'
import { QuestionInFocusWidget } from './QuestionInFocusWidget'
import { SideQuestionListWidget } from './SideQuestionListWidget'

/** Quanto o `esc` precisa ficar apertado. Três segundos: tempo de perceber e soltar. */
export const SEGURAR_MS = 3000

const vazia = (): Resposta => ({ escolhas: [] })
const respondida = (r?: Resposta) => Boolean(r && (r.escolhas.length > 0 || r.outro?.trim()))

/** Quanto falta, curto. `null` quando venceu. */
function restante(expiraEm: number, agora: number): string | null {
  const ms = expiraEm - agora
  if (ms <= 0) return null
  const min = Math.floor(ms / 60000)
  return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min}min`
}

export type RodadaTemplateProps = {
  rodada: Rodada
  agora: number
  /** Só a rodada ativa ouve o teclado — duas ouvindo, um `1` escolheria nas duas. */
  ativa: boolean
  onFecha: (id: string, respostas?: Record<string, Resposta>) => void
}

export function RodadaTemplate({ rodada, agora, ativa, onFecha }: RodadaTemplateProps) {
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({})
  const [foco, setFoco] = useState(0)
  /** Quanto do `esc` já foi segurado, 0 a 1. Vira a barra que enche o botão. */
  const [segurando, setSegurando] = useState(0)

  const pergunta = rodada.perguntas[foco]
  const tudoPronto = rodada.perguntas.every((p) => respondida(respostas[p.question]))
  /**
   * A PRÓXIMA que ainda não tem resposta, ou `null` quando não falta nenhuma.
   *
   * Ela começa a busca DEPOIS do foco e dá a volta: quem pulou a segunda e
   * respondeu a terceira é levado de volta pra segunda, em vez de cair no fim da
   * lista e ter que procurar o que faltou.
   */
  const proximaPendente = (() => {
    const n = rodada.perguntas.length
    for (let d = 1; d <= n; d++) {
      const i = (foco + d) % n
      if (!respondida(respostas[rodada.perguntas[i].question])) return i
    }
    return null
  })()

  const escolhe = useCallback(
    (q: number, label: string) => {
      const p = rodada.perguntas[q]
      setRespostas((atual) => {
        const anterior = atual[p.question] ?? vazia()
        // MULTISELECT alterna; escolha única substitui. É a diferença entre
        // "marque os que valem" e "escolha um", e trocar uma pela outra faria a
        // pessoa clicar duas vezes achando que somou.
        const escolhas = p.multiSelect
          ? anterior.escolhas.includes(label)
            ? anterior.escolhas.filter((e) => e !== label)
            : [...anterior.escolhas, label]
          : [label]
        return { ...atual, [p.question]: { ...anterior, escolhas } }
      })
      // ESCOLHER NÃO AVANÇA. O foco andava sozinho na escolha única, e o efeito
      // era o oposto do pretendido: a opção marcada saía da vista no mesmo
      // instante em que foi marcada, e quem tinha acabado de apertar `2` não via
      // o `2` selecionado — ficava sem saber se pegou. Marcar e avançar são duas
      // coisas, e agora são dois gestos: o dígito marca, o botão avança.
    },
    [rodada.perguntas],
  )

  const escreve = useCallback(
    (q: number, campo: 'outro' | 'anotacao', v: string) => {
      setRespostas((atual) => {
        const chave = rodada.perguntas[q].question
        return { ...atual, [chave]: { ...(atual[chave] ?? vazia()), [campo]: v } }
      })
    },
    [rodada.perguntas],
  )

  useEffect(() => {
    if (!ativa) return
    const onKey = (e: KeyboardEvent) => {
      // Digitando no "Other" ou na nota, o teclado é do campo. Sem isto, escrever
      // "2" numa resposta livre escolheria a segunda opção.
      const alvo = e.target as HTMLElement
      if (alvo?.tagName === 'INPUT' || alvo?.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') alvo.blur()
        return
      }
      // ESC SEGURADO, não apertado. Pular faz o agente PARAR e registrar
      // `pendente` — irreversível do lado de lá. `e.repeat` sai fora: o SO repete
      // keydown enquanto a tecla está baixa, e cada repetição reiniciaria a
      // contagem do zero.
      if (e.key === 'Escape') return e.repeat ? undefined : setSegurando(0.0001)
      // ⏎ AVANÇA, ⌘⏎ CONFIRMA — e enquanto faltar resposta, ⌘⏎ também avança.
      //
      // É o que impede a rodada de terminar antes da hora: o botão só vira
      // "confirmar" quando toda pergunta tem resposta, e até lá a tecla que a
      // mão aperta pra seguir leva pra próxima PENDENTE. Sem isso, quem apertasse
      // ⌘⏎ na primeira de quatro receberia uma recusa do servidor em vez de ir
      // pra segunda.
      if (e.key === 'Enter') {
        e.preventDefault()
        if (proximaPendente !== null) return setFoco(proximaPendente)
        if (e.metaKey || e.ctrlKey) return onFecha(rodada.id, respostas)
        return
      }

      const quantas = rodada.perguntas.length
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        return setFoco((f) => (f + 1) % quantas)
      }
      if (e.key === 'j' || e.key === 'J') return setFoco((f) => (f + 1) % quantas)
      if (e.key === 'k' || e.key === 'K') return setFoco((f) => (f - 1 + quantas) % quantas)

      const n = Number(e.key)
      const quantasOpcoes = pergunta?.options.length ?? 0
      if (n >= 1 && n <= quantasOpcoes) return escolhe(foco, pergunta.options[n - 1].label)
      // O DÍGITO SEGUINTE é o "outra resposta" — o campo era a única resposta
      // possível fora do alcance do teclado. `preventDefault` porque senão o
      // próprio dígito entraria no campo que ele acabou de focar.
      if (n === quantasOpcoes + 1) {
        e.preventDefault()
        cartao.current?.querySelector<HTMLInputElement>('[data-outro]')?.focus()
      }
    }
    // SOLTAR ZERA — é o que faz o hold ser reversível: quem começou sem querer só
    // tira o dedo. E `blur` zera junto: sem foco na janela o keyup nunca chega, e
    // a tecla ficaria "presa" enchendo a barra sozinha depois de trocar de app.
    const onUp = (e: KeyboardEvent) => (e.key === 'Escape' ? setSegurando(0) : undefined)
    const onBlur = () => setSegurando(0)
    addEventListener('keydown', onKey)
    addEventListener('keyup', onUp)
    addEventListener('blur', onBlur)
    return () => {
      removeEventListener('keydown', onKey)
      removeEventListener('keyup', onUp)
      removeEventListener('blur', onBlur)
    }
  }, [ativa, foco, pergunta, respostas, tudoPronto, rodada.id, rodada.perguntas.length, escolhe, onFecha])

  // A CONTAGEM do hold, por rAF: a barra anda no ritmo do vídeo, e o disparo sai
  // do TEMPO real, não de quantos quadros passaram — num quadro perdido, um
  // contador por frame chegaria tarde.
  const segurandoAtivo = segurando > 0
  useEffect(() => {
    if (!segurandoAtivo) return
    const t0 = performance.now()
    let vivo = true
    const passo = () => {
      if (!vivo) return
      const p = Math.min(1, (performance.now() - t0) / SEGURAR_MS)
      setSegurando(p)
      if (p >= 1) return onFecha(rodada.id)
      requestAnimationFrame(passo)
    }
    requestAnimationFrame(passo)
    return () => {
      vivo = false
    }
    // `segurando` fica FORA das deps de propósito: ele muda a cada quadro, e
    // entrar aqui reiniciaria o `t0` sessenta vezes por segundo — a barra nunca
    // chegaria ao fim. O gatilho é ele SAIR do zero, que é o que o boolean diz.
  }, [segurandoAtivo, rodada.id, onFecha])

  // O FOCO VAI PRA RODADA ATIVA assim que ela aparece. Sem isto o foco fica no
  // `body`, e o primeiro `Tab` de quem prefere navegar por tabulação começa do
  // topo do documento em vez da pergunta. `preventScroll` porque a rodada já
  // está inteira na tela — rolar aqui só sacode a janela na chegada.
  const cartao = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ativa) cartao.current?.focus({ preventScroll: true })
  }, [ativa])

  const falta = restante(rodada.expiraEm, agora)

  return (
    <Card
      ref={cartao}
      tabIndex={-1}
      shadow="sm"
      className={`border outline-none ${ativa ? 'border-primary rodada-chegou' : 'border-default-200'}`}
    >
      <CardHeader className="flex items-center justify-between gap-3 pb-2">
        <div className="flex flex-wrap gap-1.5">
          {/* A ORIGEM é o que impede decidir sobre estado que já mudou: saber QUE
              agente, em que run, é metade do contexto. O `?.` cobre o que já está
              gravado sem ela — registro velho não se reescreve sozinho. */}
          {rodada.origem?.agente && (
            <Chip size="sm" variant="dot">
              {rodada.origem.agente}
            </Chip>
          )}
          {rodada.origem?.run && (
            <Chip size="sm" variant="dot">
              {rodada.origem.run}
            </Chip>
          )}
          {rodada.origem?.pane && (
            <Chip size="sm" variant="dot">
              {rodada.origem.pane}
            </Chip>
          )}
        </div>
        <Chip size="sm" variant="flat" color={falta ? 'default' : 'danger'}>
          {falta ?? 'vencida'}
        </Chip>
      </CardHeader>

      <CardBody className="gap-4 pt-0">
        {/* O PAI dita o tamanho: a lista tem largura fixa porque é uma coluna de
            rótulos curtos; o foco fica com o resto. Numa janela estreita elas
            empilham — e a lista continua sendo a primeira, que é a ordem certa
            pra saber quantas decisões vêm. */}
        <div className="flex flex-row gap-5">
          <div className="w-32 shrink-0">
            <SideQuestionListWidget
              perguntas={rodada.perguntas}
              foco={foco}
              respostas={respostas}
              onFoco={setFoco}
            />
          </div>
          <div className="min-w-0 flex-1">
            {pergunta && (
              <QuestionInFocusWidget
                pergunta={pergunta}
                resposta={respostas[pergunta.question] ?? vazia()}
                onEscolhe={(label) => escolhe(foco, label)}
                onEscreve={(campo, v) => escreve(foco, campo, v)}
                mostraAtalhos={ativa}
                mostraHeader={rodada.perguntas.length < 2}
              />
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {/* UM botão, dois trabalhos, e o rótulo diz qual está fazendo. Enquanto
              falta resposta ele leva pra próxima pendente; quando não falta, ele
              confirma. Um `confirmar` desabilitado no lugar dele seria um botão
              morto ocupando o único lugar que a pessoa olha — ela clicaria, nada
              aconteceria, e nada diria o que fazer em seguida. */}
          <Button
            color="primary"
            variant={tudoPronto ? 'solid' : 'flat'}
            className="flex-1"
            onPress={() =>
              proximaPendente !== null ? setFoco(proximaPendente) : onFecha(rodada.id, respostas)
            }
          >
            {tudoPronto ? 'confirmar' : 'próxima'}
            {ativa && (
              <kbd className="ml-2 font-mono text-xs opacity-60">{tudoPronto ? '⌘⏎' : '⏎'}</kbd>
            )}
          </Button>
          {/* PULAR é primeira classe e visualmente distinto de uma opção: sem essa
              saída, quem não quer decidir agora clica qualquer coisa pra a tela
              limpar — e resposta dada pra calar a pergunta parece uma decisão sem
              ser uma.

              SEGURAR, não clicar: ele fica ao lado do `confirmar`, e um clique
              errado ali descartaria a pergunta. Mouse e teclado compartilham a
              MESMA contagem — `segurando` é um estado só. */}
          <Button
            variant="light"
            className="relative overflow-hidden text-default-500"
            onMouseDown={() => setSegurando(0.0001)}
            onMouseUp={() => setSegurando(0)}
            onMouseLeave={() => setSegurando(0)}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-danger-100"
              style={{ width: `${segurando * 100}%` }}
            />
            <span className="relative">
              {segurando ? 'solte pra cancelar' : 'pular'}
              {ativa && !segurando && <kbd className="ml-2 font-mono text-xs">segure esc</kbd>}
            </span>
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}
