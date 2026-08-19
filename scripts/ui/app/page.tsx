'use client'
//! A tela: as rodadas ABERTAS, e nada mais.
//!
//! Não há histórico, nem filtro. Rodada decidida não é trabalho de ninguém — e
//! uma tela que mostra as duas coisas obriga quem chega a procurar o que precisa
//! de ação no meio do que não precisa.
//!
//! ## Os atalhos, e por que eles existem
//!
//! Esta tela compete com "abrir o terminal e olhar". Se custar uma ida ao mouse,
//! ela não compete.
//!
//!   1..4   escolhe a opção na pergunta FOCADA
//!   ⌘N     pula pra próxima pergunta da rodada (N de next)
//!   esc    pula a rodada inteira
//!   ⏎      confirma, quando toda pergunta tem resposta
//!
//! O foco é por PERGUNTA, não por rodada: uma rodada tem até quatro, e o número
//! precisa saber a qual delas ele se refere.

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  Spinner,
} from '@heroui/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Resposta, Rodada } from '../lib/store'
import { useRodadas } from '../lib/useRodadas'

/** Quanto falta, curto. `null` quando venceu. */
function restante(expiraEm: number, agora: number): string | null {
  const ms = expiraEm - agora
  if (ms <= 0) return null
  const min = Math.floor(ms / 60000)
  return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min}min`
}

const vazia = (): Resposta => ({ escolhas: [] })
const respondida = (r?: Resposta) => Boolean(r && (r.escolhas.length > 0 || r.outro?.trim()))

function CardRodada({
  rodada,
  agora,
  ativa,
  onFecha,
}: {
  rodada: Rodada
  agora: number
  ativa: boolean
  onFecha: (id: string, respostas?: Record<string, Resposta>) => void
}) {
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({})
  const [foco, setFoco] = useState(0)
  // O preview mostrado é o da opção sob o cursor/teclado. Um por vez: com dois
  // lado a lado ninguém compara nada, só lê menos de cada.
  const [espiada, setEspiada] = useState<{ q: number; o: number } | null>(null)

  const pergunta = rodada.perguntas[foco]
  const tudoPronto = rodada.perguntas.every((p) => respondida(respostas[p.question]))

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
      // Escolha única já resolveu esta pergunta: o foco anda sozinho, senão a
      // pessoa tem que apertar ⌘N depois de cada uma.
      if (!p.multiSelect && q < rodada.perguntas.length - 1) setFoco(q + 1)
    },
    [rodada.perguntas],
  )

  const escreve = useCallback((q: number, campo: 'outro' | 'anotacao', v: string) => {
    setRespostas((atual) => {
      const chave = rodada.perguntas[q].question
      return { ...atual, [chave]: { ...(atual[chave] ?? vazia()), [campo]: v } }
    })
  }, [rodada.perguntas])

  useEffect(() => {
    if (!ativa) return
    const onKey = (e: KeyboardEvent) => {
      // Digitando no "Other" ou na anotação, o teclado é do campo. Sem isto,
      // escrever "2" numa resposta livre escolheria a segunda opção.
      const alvo = e.target as HTMLElement
      if (alvo?.tagName === 'INPUT' || alvo?.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') alvo.blur()
        return
      }
      if (e.key === 'Escape') return onFecha(rodada.id)
      if (e.key === 'Enter' && tudoPronto) return onFecha(rodada.id, respostas)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        return setFoco((f) => (f + 1) % rodada.perguntas.length)
      }
      const n = Number(e.key)
      if (n >= 1 && n <= (pergunta?.options.length ?? 0)) escolhe(foco, pergunta.options[n - 1].label)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [ativa, foco, pergunta, respostas, tudoPronto, rodada.id, rodada.perguntas.length, escolhe, onFecha])

  const falta = restante(rodada.expiraEm, agora)
  const previewAberto = espiada ? rodada.perguntas[espiada.q]?.options[espiada.o]?.preview : undefined

  return (
    <Card shadow="sm" className={`border ${ativa ? 'border-primary' : 'border-default-200'}`}>
      <CardHeader className="flex flex-col items-start gap-2 pb-2">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {/* A ORIGEM na tela é o que impede decidir sobre estado que já mudou:
                saber QUE agente, em que run, é metade do contexto.

                O `?.` cobre o que JÁ está gravado sem `origem` — a normalização
                em `abre()` só vale pra rodada nova, e registro velho não se
                reescreve sozinho. */}
            {rodada.origem?.agente && <Chip size="sm" variant="dot">{rodada.origem.agente}</Chip>}
            {rodada.origem?.run && <Chip size="sm" variant="dot">{rodada.origem.run}</Chip>}
            {rodada.origem?.pane && <Chip size="sm" variant="dot">{rodada.origem.pane}</Chip>}
          </div>
          <Chip size="sm" variant="flat" color={falta ? 'default' : 'danger'}>
            {falta ?? 'vencida'}
          </Chip>
        </div>
      </CardHeader>

      <CardBody className="gap-5 pt-0">
        {rodada.perguntas.map((p, iq) => {
          const resp = respostas[p.question] ?? vazia()
          const focada = ativa && iq === foco
          return (
            <div key={p.question} className={focada ? '' : 'opacity-70'}>
              <div className="flex items-center gap-2 mb-2">
                <Chip size="sm" color={focada ? 'primary' : 'default'} variant={focada ? 'solid' : 'flat'}>
                  {p.header}
                </Chip>
                {p.multiSelect && <span className="text-xs text-default-400">várias</span>}
                {respondida(resp) && <span className="text-xs text-success">✓</span>}
              </div>
              <h2 className="text-base font-semibold leading-snug mb-3">{p.question}</h2>

              <div className={previewAberto && espiada?.q === iq ? 'grid sm:grid-cols-2 gap-3' : 'space-y-2'}>
                <div className="space-y-2">
                  {p.options.map((o, io) => {
                    const marcada = resp.escolhas.includes(o.label)
                    return (
                      <Button
                        key={o.label}
                        variant={marcada ? 'solid' : 'bordered'}
                        color={marcada ? 'primary' : 'default'}
                        className="w-full h-auto justify-start py-3 px-4 text-left"
                        onPress={() => escolhe(iq, o.label)}
                        onMouseEnter={() => o.preview && setEspiada({ q: iq, o: io })}
                        onFocus={() => o.preview && setEspiada({ q: iq, o: io })}
                      >
                        <span className="flex-1">
                          <span className="block font-semibold">{o.label}</span>
                          {o.description && (
                            <span className="block text-sm opacity-70 mt-0.5">{o.description}</span>
                          )}
                        </span>
                        {focada && <kbd className="text-xs font-mono opacity-50">{io + 1}</kbd>}
                      </Button>
                    )
                  })}

                  {/* "OTHER" existe SEMPRE, sem o chamador pedir. É a saída pra
                      quando nenhuma opção descreve a realidade — e sem ela a
                      pessoa escolhe a menos errada, que vira uma decisão que
                      ninguém tomou. */}
                  <Input
                    size="sm"
                    variant="bordered"
                    placeholder="outra resposta…"
                    value={resp.outro ?? ''}
                    onValueChange={(v) => escreve(iq, 'outro', v)}
                    classNames={{ inputWrapper: 'border-dashed' }}
                  />
                  <Input
                    size="sm"
                    variant="flat"
                    placeholder="nota (opcional)"
                    value={resp.anotacao ?? ''}
                    onValueChange={(v) => escreve(iq, 'anotacao', v)}
                  />
                </div>

                {previewAberto && espiada?.q === iq && (
                  <pre className="text-xs bg-default-100 rounded-lg p-3 overflow-x-auto whitespace-pre font-mono">
                    {previewAberto}
                  </pre>
                )}
              </div>
              {iq < rodada.perguntas.length - 1 && <Divider className="mt-4" />}
            </div>
          )
        })}

        <div className="flex gap-2 pt-1">
          <Button
            color="primary"
            className="flex-1"
            isDisabled={!tudoPronto}
            onPress={() => onFecha(rodada.id, respostas)}
          >
            confirmar
            {ativa && <kbd className="ml-2 text-xs font-mono opacity-60">⏎</kbd>}
          </Button>
          {/* PULAR é primeira classe e visualmente distinto de uma opção: sem
              essa saída, quem não quer decidir agora clica qualquer coisa pra a
              tela limpar — e resposta dada pra calar a pergunta parece uma
              decisão sem ser uma. */}
          <Button variant="light" className="text-default-500" onPress={() => onFecha(rodada.id)}>
            pular
            {ativa && <kbd className="ml-2 text-xs font-mono">esc</kbd>}
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

export default function Page() {
  const { rodadas, fecha } = useRodadas()

  // O relógio é LOCAL e roda de minuto em minuto. `expiraEm` já está no
  // registro; pedir a contagem ao servidor seria uma escrita por minuto por
  // rodada pra mudar um texto.
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const ativa = useMemo(() => rodadas?.[0]?.id, [rodadas])

  if (rodadas === undefined)
    return (
      <main className="min-h-dvh grid place-items-center">
        <Spinner label="lendo as perguntas" />
      </main>
    )

  if (rodadas.length === 0)
    return (
      <main className="min-h-dvh grid place-items-center p-6">
        <div className="text-center">
          <p className="text-lg font-medium">nada pendente</p>
          <p className="text-sm text-default-500 mt-1">nenhum processo está esperando decisão</p>
        </div>
      </main>
    )

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 space-y-4">
      {rodadas.map((r) => (
        <CardRodada key={r.id} rodada={r} agora={agora} ativa={r.id === ativa} onFecha={fecha} />
      ))}
      <p className="text-xs text-default-400 text-center pt-2">
        <kbd className="font-mono">1-4</kbd> escolhe · <kbd className="font-mono">⌘N</kbd> próxima
        pergunta · <kbd className="font-mono">⏎</kbd> confirma · <kbd className="font-mono">esc</kbd> pula
      </p>
    </main>
  )
}
