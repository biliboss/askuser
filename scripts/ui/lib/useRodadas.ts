'use client'
//! As rodadas abertas, e elas se atualizam sozinhas.
//!
//! `EventSource` reconecta sozinho quando a conexão cai — é o motivo de o SSE
//! ganhar de um WebSocket aqui: o navegador já traz a reconexão, e a única coisa
//! que trafega é "mudou". Quem busca o dado é o `fetch` logo depois.

import { useCallback, useEffect, useState } from 'react'
import type { Resposta, Rodada } from './store'

export function useRodadas() {
  // `undefined` é "ainda carregando" e `[]` é "não há rodada". São estados
  // diferentes, e mostrar "nada pendente" enquanto carrega é mentir por 200ms.
  const [rodadas, setRodadas] = useState<Rodada[] | undefined>(undefined)

  const recarrega = useCallback(async () => {
    const r = await fetch('/api/questions', { cache: 'no-store' })
    setRodadas(await r.json())
  }, [])

  useEffect(() => {
    void recarrega()
    const es = new EventSource('/api/stream')
    es.onmessage = () => void recarrega()
    return () => es.close()
  }, [recarrega])

  /** `respostas` ausente = pulou. Otimista na tela; a rota é a verdade. */
  const fecha = useCallback(
    async (id: string, respostas?: Record<string, Resposta>) => {
      setRodadas((atual) => atual?.filter((r) => r.id !== id))
      await fetch('/api/questions', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, respostas }),
      })
      // 409 quer dizer que o prazo ou outra aba fechou antes — o refetch devolve
      // o estado real em vez de deixar a tela mentindo.
      void recarrega()
    },
    [recarrega],
  )

  return { rodadas, fecha }
}
