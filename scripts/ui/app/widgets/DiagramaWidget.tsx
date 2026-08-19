'use client'
//! O `preview` de uma opção, renderizado. **Mermaid, HTML, ou texto** — e quem
//! decide qual é o CONTEÚDO, não um campo.
//!
//! Uma opção boa descreve a CONSEQUÊNCIA de escolhê-la, e algumas consequências
//! não são uma frase: um fluxo é uma forma, e uma cor de botão é o botão. Escrever
//! isso em prosa gasta três linhas e ainda deixa a pessoa desenhando na cabeça.
//!
//! ## Como ele decide
//!
//! `flowchart`, `sequenceDiagram`, … abrem mermaid. `<` na primeira coluna é
//! HTML. O resto é monoespaçado. Um campo `tipo: 'mermaid'` no contrato seria
//! mais uma coisa pro chamador acertar, e errar — o texto já se identifica.
//!
//! ## O HTML roda num sandbox, e isso não é paranoia de checklist
//!
//! O preview vem de quem CHAMOU o CLI, e injetá-lo com `innerHTML` daria a esse
//! texto o mesmo poder da página: ler o que já está respondido, disparar `fetch`
//! pra rota que fecha rodada, responder no lugar da pessoa. `<iframe sandbox>`
//! sem `allow-scripts` e sem `allow-same-origin` corta os três — o preview
//! desenha e não faz mais nada.
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
export const ehHtml = (s: string) => /^\s*</.test(s) && !ehMermaid(s)

/** `contain` porque o preview mora dentro de um cartão e não manda no tamanho dele. */
const MOLDURA = 'rounded-lg bg-default-50 overflow-hidden'

function Html({ preview, alto }: { preview: string; alto: boolean }) {
  // A folha mínima existe porque o iframe não herda NADA da página: sem ela um
  // `<button>` sai com o estilo cru do navegador, e comparar botões crus não
  // responde a pergunta que a comparação faz.
  const doc = `<!doctype html><meta charset="utf-8"><style>
    :root{color-scheme:light dark}
    body{margin:0;padding:12px;font:14px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;
         display:grid;place-items:center;min-height:calc(100% - 24px)}
    html,body{height:100%}
  </style>${preview}`
  return (
    <iframe
      title="preview"
      // SEM `allow-scripts` e SEM `allow-same-origin`: o preview desenha e nada
      // mais. Ligar os dois juntos anula o sandbox inteiro.
      sandbox=""
      srcDoc={doc}
      className={`w-full ${MOLDURA} border-0`}
      // 210 no compacto: com 160 o mockup de uma TELA (chip, enunciado, duas
      // opções, botão) cortava o botão ao meio — e um preview cortado compara
      // menos que nenhum, porque a pessoa acha que viu.
      style={{ height: alto ? 210 : 240 }}
    />
  )
}

export function DiagramaWidget({ preview, compacto = false }: { preview: string; compacto?: boolean }) {
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

  if (ehHtml(preview)) return <Html preview={preview} alto={compacto} />

  if (!ehMermaid(preview) || erro)
    return (
      <div className="mt-1">
        <pre className={`overflow-auto whitespace-pre p-3 font-mono text-xs ${MOLDURA}`}>{preview}</pre>
        {erro && <p className="mt-1 text-xs text-danger">o diagrama não compilou: {erro}</p>}
      </div>
    )

  // `[&_svg]:mx-auto` porque o mermaid emite um SVG de largura própria — sem
  // isto ele encosta na esquerda e o desenho fica torto dentro do card.
  return (
    <div
      ref={alvo}
      className={`mt-1 overflow-auto p-3 ${MOLDURA} [&_svg]:mx-auto [&_svg]:max-w-full`}
      style={compacto ? { maxHeight: 180 } : undefined}
    />
  )
}
