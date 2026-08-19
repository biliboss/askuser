'use client'
//! A pergunta EM FOCO: o enunciado, as opções, o "Other" e a nota.
//!
//! Uma por vez, e é a decisão de layout que sustenta o resto. Empilhar as quatro
//! numa coluna dava um card de 1769px (medido em 19/08) — mais alto que qualquer
//! laptop, com `confirmar` nascendo fora da tela. Com uma em foco, a altura da
//! janela passa a ser a da MAIOR pergunta, não a soma delas.
//!
//! E há a razão que não é de pixel: quatro enunciados visíveis ao mesmo tempo
//! convidam a responder no diagonal. Uma por vez é a mesma quantidade de leitura
//! distribuída como decisão.
//!
//! **Este widget não sabe navegar.** Ele recebe UMA pergunta e devolve o que a
//! pessoa fez com ela; quem escolhe qual é o pai. É o que deixa a lista lateral,
//! os dígitos e o `j`/`k` moverem a mesma coisa sem se conhecerem.

import { Button, Chip, Input } from '@heroui/react'
import type { Pergunta, Resposta } from '../../lib/store'
import { DiagramaWidget } from './DiagramaWidget'

export type QuestionInFocusWidgetProps = {
  pergunta: Pergunta
  resposta: Resposta
  /** Alterna em `multiSelect`, substitui em escolha única — quem decide é o pai. */
  onEscolhe: (label: string) => void
  onEscreve: (campo: 'outro' | 'anotacao', v: string) => void
  /** Os `kbd` dos dígitos. Falso quando outra coisa tem o teclado. */
  mostraAtalhos?: boolean
  /** O chip do `header`. Falso quando a lista lateral já o mostra. */
  mostraHeader?: boolean
}

export function QuestionInFocusWidget({
  pergunta,
  resposta,
  onEscolhe,
  onEscreve,
  mostraAtalhos = true,
  mostraHeader = true,
}: QuestionInFocusWidgetProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* O `header` só aparece aqui quando NÃO há lista — com ela, o mesmo
          rótulo estaria na tela duas vezes, e o segundo não informa nada. */}
      <div className="flex items-baseline gap-2">
        {mostraHeader && (
          <Chip size="sm" color="primary" variant="flat">
            {pergunta.header}
          </Chip>
        )}
        {pergunta.multiSelect && (
          <span className="text-xs text-default-400">marque quantas valerem</span>
        )}
      </div>

      <h2 className="text-lg font-semibold leading-snug">{pergunta.question}</h2>

      <div className="flex flex-col gap-2">
        {pergunta.options.map((o, i) => {
          const marcada = resposta.escolhas.includes(o.label)
          return (
            <div key={o.label}>
              <Button
                variant={marcada ? 'solid' : 'bordered'}
                color={marcada ? 'primary' : 'default'}
                className="h-auto w-full justify-start px-4 py-3 text-left"
                onPress={() => onEscolhe(o.label)}
              >
                <span className="flex-1">
                  <span className="block font-semibold">{o.label}</span>
                  {o.description && (
                    <span className="mt-0.5 block text-sm opacity-70">{o.description}</span>
                  )}
                </span>
                {mostraAtalhos && <kbd className="font-mono text-xs opacity-50">{i + 1}</kbd>}
              </Button>
              {/* SEMPRE aberto, não no hover: o preview é a razão de a opção
                  existir (um diagrama, um mockup, um trecho), e escondê-lo atrás
                  do cursor faz quem usa teclado nunca ver. Só cabe em escolha
                  única — o store recusa `preview` com `multiSelect`. */}
              {o.preview && <DiagramaWidget preview={o.preview} />}
            </div>
          )
        })}
      </div>

      {/* "OTHER" existe SEMPRE, sem o chamador pedir. É a saída pra quando
          nenhuma opção descreve a realidade — e sem ela a pessoa escolhe a menos
          errada, que vira uma decisão que ninguém tomou. */}
      {/* Ele tem o DÍGITO SEGUINTE ao das opções — com três opções, é o `4`. O
          campo era a única resposta possível que o teclado não alcançava: pra
          escrever ali a mão tinha que ir ao mouse, e a saída pro caso "nenhuma
          destas" custava mais que as respostas prontas.

          O dígito FOCA, não preenche: o que vem depois é texto, e quem digita
          é a pessoa. */}
      <Input
        data-outro
        size="sm"
        variant="bordered"
        placeholder="outra resposta…"
        value={resposta.outro ?? ''}
        onValueChange={(v) => onEscreve('outro', v)}
        classNames={{ inputWrapper: 'border-dashed' }}
        endContent={
          mostraAtalhos && (
            <kbd className="font-mono text-xs text-default-400">{pergunta.options.length + 1}</kbd>
          )
        }
      />
      <Input
        size="sm"
        variant="flat"
        placeholder="nota (opcional)"
        value={resposta.anotacao ?? ''}
        onValueChange={(v) => onEscreve('anotacao', v)}
      />
    </div>
  )
}
