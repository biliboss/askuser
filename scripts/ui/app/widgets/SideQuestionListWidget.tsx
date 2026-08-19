'use client'
//! A LISTA das perguntas da rodada, ao lado. Uma linha por pergunta.
//!
//! Ela existe porque uma rodada tem até quatro decisões e só uma cabe em foco.
//! Sem a lista, quem responde a primeira não sabe se vêm mais três nem quantas
//! já resolveu — e "uma interrupção, N decisões" vira quatro telas seguidas com
//! cara de uma.
//!
//! Cada linha carrega o `header` — o rótulo de 12 chars que o chamador escreveu
//! exatamente pra isto — e um ✓ que responde "já resolvi esta?" sem abrir.
//!
//! **Sem número.** A lista já teve `1 2 3`, e era um erro de linguagem: os
//! dígitos ESCOLHEM uma opção, e ali eles moviam o foco. Dois verbos no mesmo
//! símbolo, na mesma tela. Os dígitos ficaram com a escolha, que é a ação
//! frequente; navegar é `j`/`k`, que não disputa com nada.
//!
//! **Não mostra a pergunta inteira.** Enunciado inteiro em item de lista vira
//! três linhas de texto e a lista deixa de ser escaneável — que é a única coisa
//! que ela faz melhor que o foco.

import type { Pergunta, Resposta } from '../../lib/store'

export type SideQuestionListWidgetProps = {
  perguntas: Pergunta[]
  /** Índice da que está em foco. */
  foco: number
  /** Por texto da pergunta, igual ao contrato. */
  respostas: Record<string, Resposta>
  onFoco: (i: number) => void
}

const respondida = (r?: Resposta) => Boolean(r && (r.escolhas.length > 0 || r.outro?.trim()))

export function SideQuestionListWidget({
  perguntas,
  foco,
  respostas,
  onFoco,
}: SideQuestionListWidgetProps) {
  // UMA pergunta não precisa de lista: ela seria uma linha dizendo "você está
  // aqui". O espaço vai todo pro foco.
  if (perguntas.length < 2) return null

  return (
    <nav aria-label="perguntas da rodada" className="flex flex-col">
      {perguntas.map((p, i) => {
        const emFoco = i === foco
        const ok = respondida(respostas[p.question])
        return (
          <button
            key={p.question}
            type="button"
            onClick={() => onFoco(i)}
            aria-current={emFoco}
            className={`flex items-start gap-2 border-l-2 py-2 pl-3 pr-2 text-left text-sm transition-colors ${
              emFoco
                ? 'border-primary font-medium text-foreground'
                : 'border-default-200 text-default-400 hover:text-default-600'
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate">{p.header}</span>
              {/* A DESCRIPTION diz o que está em jogo — "banco" não conta que a
                  escolha é de dependência. Sete palavras é o teto do contrato, e
                  o teto existe pra isto: item de duas linhas acaba com a lista
                  escaneável. */}
              {p.description && (
                <span className="mt-0.5 block text-xs leading-tight text-default-400">
                  {p.description}
                </span>
              )}
            </span>
            {/* O ✓ ocupa lugar mesmo vazio: sem isso a lista dança a cada
                resposta, e o alvo do clique muda debaixo do cursor. */}
            <span className={`w-3 shrink-0 text-center text-success ${ok ? 'opacity-100' : 'opacity-0'}`}>
              ✓
            </span>
          </button>
        )
      })}
    </nav>
  )
}
