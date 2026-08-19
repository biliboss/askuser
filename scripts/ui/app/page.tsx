'use client'
//! A tela: as perguntas ABERTAS, e nada mais.
//!
//! Não há lista de respondidas, nem histórico, nem filtro. Uma pergunta que já
//! foi decidida não é trabalho de ninguém — e uma tela que mostra as duas coisas
//! obriga quem chega a procurar o que precisa de ação no meio do que não precisa.

import { Button, Card, CardBody, CardHeader, Chip, Spinner } from '@heroui/react'
import { useEffect, useState } from 'react'
import { usePerguntas } from '../lib/usePerguntas'

/** Quanto falta, em texto curto. `null` quando já venceu. */
function restante(expiraEm: number, agora: number): string | null {
  const ms = expiraEm - agora
  if (ms <= 0) return null
  const min = Math.floor(ms / 60000)
  return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min}min`
}

export default function Page() {
  const { perguntas, decide } = usePerguntas()

  // O RELÓGIO É LOCAL e roda de minuto em minuto. O `expiraEm` já está no
  // registro, então quem faz a contagem regressiva é a tela — pedir isso ao
  // servidor seria uma escrita por minuto por pergunta pra mudar um texto.
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  // TECLADO: número escolhe na primeira pergunta, `esc` pula. É o caminho mais
  // rápido, e ele existe porque o app compete com "abrir o pane e olhar" — se
  // custar uma ida ao mouse, não compete.
  useEffect(() => {
    const q = perguntas?.[0]
    if (!q) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return void decide(q.id, -1)
      const n = Number(e.key)
      if (n >= 1 && n <= q.opcoes.length) void decide(q.id, n - 1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [perguntas, decide])

  // `undefined` é "ainda carregando"; `[]` é "não há pergunta". São estados
  // diferentes, e mostrar "nada pendente" enquanto carrega é mentir por 200ms.
  if (perguntas === undefined) {
    return (
      <main className="min-h-dvh grid place-items-center">
        <Spinner label="lendo as perguntas" />
      </main>
    )
  }

  if (perguntas.length === 0) {
    return (
      <main className="min-h-dvh grid place-items-center p-6">
        <div className="text-center">
          <p className="text-lg font-medium">nada pendente</p>
          <p className="text-sm text-default-500 mt-1">nenhum agente está esperando decisão</p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6 space-y-4">
      {perguntas.map((q, iq) => {
        const falta = restante(q.expiraEm, agora)
        return (
          <Card key={q.id} shadow="sm" className="border border-default-200">
            <CardHeader className="flex flex-col items-start gap-2 pb-2">
              <div className="flex w-full items-start justify-between gap-3">
                <h2 className="text-base font-semibold leading-snug">{q.texto}</h2>
                <Chip size="sm" variant="flat" color={falta ? 'default' : 'danger'}>
                  {falta ?? 'vencida'}
                </Chip>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {/* A ORIGEM na tela é o que impede decidir sobre estado que já
                    mudou: saber QUE agente, em que run, é metade do contexto. */}
                {q.origem.agente && <Chip size="sm" variant="dot">{q.origem.agente}</Chip>}
                {q.origem.run && <Chip size="sm" variant="dot">{q.origem.run}</Chip>}
                {q.origem.pane && <Chip size="sm" variant="dot">{q.origem.pane}</Chip>}
              </div>
            </CardHeader>

            <CardBody className="gap-2 pt-0">
              {q.opcoes.map((o, i) => (
                <Button
                  key={i}
                  variant="bordered"
                  className="h-auto justify-start py-3 px-4 text-left"
                  onPress={() => void decide(q.id, i)}
                >
                  <span className="flex-1">
                    <span className="block font-semibold">{o.rotulo}</span>
                    {o.descricao && (
                      <span className="block text-sm text-default-500 mt-0.5">{o.descricao}</span>
                    )}
                  </span>
                  {iq === 0 && <kbd className="text-xs text-default-400 font-mono">{i + 1}</kbd>}
                </Button>
              ))}

              {/* PULAR É PRIMEIRA CLASSE, e visualmente distinto de uma opção:
                  sem esta saída, quem não quer decidir agora clica qualquer
                  coisa pra a tela limpar — e resposta dada pra calar a pergunta
                  parece uma decisão sem ser uma. */}
              <Button
                variant="light"
                className="justify-between text-default-500"
                onPress={() => void decide(q.id, -1)}
              >
                pular
                {iq === 0 && <kbd className="text-xs font-mono">esc</kbd>}
              </Button>
            </CardBody>
          </Card>
        )
      })}
    </main>
  )
}
