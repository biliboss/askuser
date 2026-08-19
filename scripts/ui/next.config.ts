import type { NextConfig } from 'next'

// SEM `output: 'export'`, e a razão é o Inngest. O export estático não carrega
// route handler, e `/api/inngest` é justamente o endpoint que o Inngest chama de
// volta pra executar cada step — sem ele não há workflow durável, e sem workflow
// durável a pergunta volta a ficar aberta pra sempre.
//
// A primeira versão deste arquivo tinha `output: 'export'` porque o frontend
// seria embutido num binário desktop. Com Convex e Inngest no desenho, o app
// deixou de ser uma janela e virou um SERVIÇO: `next start` numa VPS, ao lado do
// Convex e do Inngest, e a tela chega pelo navegador — inclusive o do celular,
// que é o caso que a janela local nunca atendeu.
const config: NextConfig = {
  // `standalone` empacota o servidor com só o que ele usa — é o que faz o
  // deploy caber num container pequeno em vez de carregar `node_modules` inteiro.
  output: 'standalone',
  images: { unoptimized: true },
}

export default config
