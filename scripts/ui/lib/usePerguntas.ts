'use client'
//! As perguntas abertas, e elas se atualizam sozinhas.
//!
//! `EventSource` reconecta sozinho quando a conexão cai — é o motivo de o SSE
//! ganhar de um WebSocket aqui: o navegador já traz a reconexão, e a única coisa
//! que trafega é "mudou". Quem busca o dado é o `fetch` logo depois.
import { useCallback, useEffect, useState } from 'react'
import type { Pergunta } from './store'

export function usePerguntas() {
  // `undefined` é "ainda carregando" e `[]` é "não há pergunta". São estados
  // diferentes, e mostrar "nada pendente" enquanto carrega é mentir por 200ms.
  const [perguntas, setPerguntas] = useState<Pergunta[] | undefined>(undefined)

  const recarrega = useCallback(async () => {
    const r = await fetch('/api/questions', { cache: 'no-store' })
    setPerguntas(await r.json())
  }, [])

  useEffect(() => {
    void recarrega()
    const es = new EventSource('/api/stream')
    es.onmessage = () => void recarrega()
    return () => es.close()
  }, [recarrega])

  const decide = useCallback(
    async (id: string, indice: number) => {
      // OTIMISTA na tela, e a rota é a verdade: 409 quer dizer que outra pessoa
      // (ou o prazo) fechou antes, e o `recarrega` devolve o estado real.
      setPerguntas((atual) => atual?.filter((p) => p.id !== id))
      await fetch('/api/questions', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, indice }),
      })
      void recarrega()
    },
    [recarrega],
  )

  return { perguntas, decide }
}
