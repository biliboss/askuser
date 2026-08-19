'use client'
//! O `preview` de uma opção, renderizado. **Mermaid quando é mermaid**, texto
//! monoespaçado quando não é.
//!
//! Uma opção boa descreve a CONSEQUÊNCIA de escolhê-la, e algumas consequências
//! são uma forma, não uma frase: quem chama quem, o que vira o quê, qual caminho
//! o dado faz. Escrever isso em prosa gasta três linhas e ainda deixa a pessoa
//! desenhando na cabeça.
//!
//! ## Como ele decide
//!
//! Pelo CONTEÚDO, não por um campo novo: um `preview` que começa com uma palavra
//! de diagrama (`flowchart`, `sequenceDiagram`, …) é mermaid. Um campo
//! `tipo: 'mermaid'` no contrato seria mais uma coisa pro chamador acertar, e
//! errar — e o texto já se identifica sozinho.
//!
//! ## Falhar aqui não pode derrubar a pergunta
//!
//! Diagrama que não compila cai pro texto cru, com o erro do lado. A pergunta
//! continua respondível — nenhuma decisão fica travada porque um desenho tinha
//! uma seta errada.

import { useEffect, useId, useRef, useState } from 'react'

/** As aberturas do mermaid que fazem sentido dentro de uma opção. */
const ABERTURAS =
  /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart)\b/

export const ehMermaid = (s: string) => ABERTURAS.test(s)

export function DiagramaWidget({ preview }: { preview: string }) {
  const id = useId().replace(/:/g, '_')
  const alvo = useRef<HTMLDivElement>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!ehMermaid(preview)) return
    let vivo = true
    ;(async () => {
      try {
        // IMPORT DINÂMICO: o mermaid pesa mais que o resto da tela somada, e a
        // maioria das perguntas não tem diagrama nenhum. Assim ele só desce
        // quando alguém realmente mandou um.
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          securityLevel: 'strict',
          fontFamily: 'inherit',
        })
        const { svg } = await mermaid.render(`m${id}`, preview)
        if (vivo && alvo.current) alvo.current.innerHTML = svg
      } catch (e) {
        if (vivo) setErro((e as Error).message)
      }
    })()
    return () => {
      vivo = false
    }
  }, [preview, id])

  if (!ehMermaid(preview) || erro)
    return (
      <div className="mt-1">
        <pre className="overflow-x-auto whitespace-pre rounded-lg bg-default-100 p-3 font-mono text-xs">
          {preview}
        </pre>
        {erro && <p className="mt-1 text-xs text-danger">o diagrama não compilou: {erro}</p>}
      </div>
    )

  // `[&_svg]:mx-auto` porque o mermaid emite um SVG de largura própria — sem
  // isto ele encosta na esquerda e o desenho fica torto dentro do card.
  return (
    <div
      ref={alvo}
      className="mt-1 overflow-x-auto rounded-lg bg-default-50 p-3 [&_svg]:mx-auto [&_svg]:max-w-full"
    />
  )
}
