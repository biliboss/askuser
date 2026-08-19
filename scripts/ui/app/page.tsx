'use client'
//! A tela: as rodadas ABERTAS, e nada mais.
//!
//! Não há histórico, nem filtro. Rodada decidida não é trabalho de ninguém — e
//! uma tela que mostra as duas coisas obriga quem chega a procurar o que precisa
//! de ação no meio do que não precisa.
//!
//! Esta página é só a MOLDURA: o relógio, os três estados (carregando, vazio,
//! rodadas) e o rodapé dos atalhos. A rodada inteira mora em
//! `widgets/RodadaTemplate`, e os dois pedaços dela em `SideQuestionListWidget`
//! e `QuestionInFocusWidget`.

import { Spinner } from '@heroui/react'
import { useEffect, useMemo, useState } from 'react'
import { useRodadas } from '../lib/useRodadas'
import { RodadaTemplate } from './widgets/RodadaTemplate'

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
      <main className="grid min-h-dvh place-items-center">
        <Spinner label="lendo as perguntas" />
      </main>
    )

  if (rodadas.length === 0)
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <div className="text-center">
          <p className="text-lg font-medium">nada pendente</p>
          <p className="mt-1 text-sm text-default-500">nenhum processo está esperando decisão</p>
        </div>
      </main>
    )

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      {rodadas.map((r) => (
        <RodadaTemplate key={r.id} rodada={r} agora={agora} ativa={r.id === ativa} onFecha={fecha} />
      ))}
      <p className="pt-2 text-center text-xs text-default-400">
        <kbd className="font-mono">1-4</kbd> escolhe · <kbd className="font-mono">+1</kbd> outra · <kbd className="font-mono">j</kbd>
        <kbd className="font-mono">k</kbd> navega · <kbd className="font-mono">⏎</kbd> avança · <kbd className="font-mono">⌘⏎</kbd> confirma ·{' '}
        <kbd className="font-mono">segure esc</kbd> pula
      </p>
    </main>
  )
}
