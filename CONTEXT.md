# askuser — como se mexe

O PORQUÊ está em [`CLAUDE.md`](CLAUDE.md). Aqui é o mapa e as regras de quem
edita.

## O mapa

```
SKILL.md              a skill — é o que um agente lê pra saber USAR
CLAUDE.md             o porquê: o problema, e as três decisões que o definem
CONTEXT.md            este arquivo
scripts/
  askuser.ts          a JANELA — o contrato tipado, e `askuser()` que sobe o Neutralino
  shared.ts           o encanamento dela: config derivada, download do binário
  cli/askuser.ts      o comando. Cliente HTTP puro, zero dependência do ui/
  ui/                 o Next 15 + HeroUI + RocksDB — o app inteiro
    lib/store.ts      o banco, os 4 estados, e o guard de uma-decisão-um-registro
    lib/usePerguntas  SSE + refetch
    app/page.tsx      a tela
    app/api/…         GET · POST · PATCH, e o SSE
```

**Os TIPOS moram no `askuser.ts`, a implementação no `shared.ts`.** O outline de
um lê como API e o do outro como oficina. Quem abre pra saber o que dá pra pedir
não deveria encontrar `mkdirSync`.

**A janela é SUPERFÍCIE, não peça.** O app funciona sem ela, o CLI funciona sem
ela, e ela cair não impede ninguém de perguntar nem de responder. Por isso
`askuser()` não espera: devolve o processo e quem chamou decide o que fazer.

**O `cli/` não importa nada do `ui/`.** Ele fala HTTP com o app, e é por isso que
roda em qualquer máquina apontando `ASKUSER_URL` pra outra. Se algum dia ele
precisar de um `import` do `ui/`, a fronteira quebrou.

## Subir

```bash
cd scripts/ui && bun install && bun run dev      # 5311
bun scripts/cli/askuser.ts "pergunta?" -o "a|um" -o "b|dois"
```

O banco nasce sozinho em `scripts/ui/.data/askuser` na primeira escrita.

## As regras que não se negociam

**As duas recusas ficam nos DOIS lados.** Pergunta vazia e menos de duas opções
são recusadas no CLI (pra não gastar uma ida na rede) e no `store.ts` (porque o
servidor é a fronteira que todo cliente atravessa). Tirar uma das duas parece
DRY e é como uma segunda porta entra sem guarda.

**Uma decisão, um registro.** Toda mutação que fecha uma pergunta passa por
`fecha()`, que devolve `false` se ela já não estava `OPEN`. Dois cliques, ou o
prazo vencendo no mesmo instante em que alguém responde, produziriam dois
desfechos pro mesmo id — e quem espera leria o último que chegou. **Expirar
contra uma resposta PERDE**, e perder é o certo: houve gente.

A rota devolve `409` quando `fecha()` dá `false`. Não é 200: quem clicou precisa
saber que não foi a decisão dele que valeu.

**`runtime = 'nodejs'` em toda rota que toca o banco.** O RocksDB é binding
nativo e o runtime edge não carrega `.node`. Sem a linha, o build passa e a rota
explode em produção — falha tardia, que é a pior.

**O banco abre PREGUIÇOSO.** `RocksDatabase.open()` no corpo do módulo faz o
`next build` abrir o banco durante a coleta de dados das páginas e morrer com um
erro de I/O que não fala de build. E o RocksDB **não cria o diretório pai**: é
`mkdirSync(recursive)` antes de abrir.

**Neutralino, e nada mais pesado.** A janela usa a WebView do sistema e um
binário de ~2MB. Tauri (toolchain Rust, `target/` de ~1GB) e Electrobun
(`node_modules` de 107M) foram tentados e apagados em 19/08 — os dois
contradiziam a tese do `CLAUDE.md` pra entregar uma janela.

**Todo campo numérico da config vai EXPLÍCITO**, inclusive `port: 0`. Omitir um
mata o binário em `libc++abi: type must be number, but is null` — exceção de C++
que não nomeia o campo. A janela abre e fecha no mesmo instante, sem log útil.

**O teclado é do usuário.** Número escolhe, `esc` pula. O app compete com "abrir
o terminal e olhar" — se custar uma ida ao mouse, não compete.

## O que muda junto

| se você mexer em | mexa também em |
|---|---|
| os quatro estados | `store.ts`, `askuser.ts` (os exit codes), `CLAUDE.md` |
| a forma da rota | `askuser.ts`, `usePerguntas.ts` |
| o nome de um env var | `SKILL.md`, `README.md`, `CONTEXT.md` |
| as opções da janela | `askuser.ts` (os tipos), `shared.ts` (a config) |

## Provado, e como reprovar

Rode isto depois de mexer no store ou nas rotas — é o ciclo inteiro, sem mock:

```bash
cd scripts/ui && bun run build && bun run start &
until curl -sf localhost:5311/api/questions >/dev/null; do sleep 1; done

# 0 — escolheu
bun ../cli/askuser.ts "t" -o "a|um" -o "b|dois" --json &
sleep 2; ID=$(curl -s localhost:5311/api/questions | jq -r '.[0].id')
curl -s -X PATCH localhost:5311/api/questions -H 'content-type: application/json' \
  -d "{\"id\":\"$ID\",\"indice\":0}"          # {"ok":true}
curl -s -X PATCH localhost:5311/api/questions -H 'content-type: application/json' \
  -d "{\"id\":\"$ID\",\"indice\":1}" -o /dev/null -w '%{http_code}\n'   # 409

# 3 — expirou, com NINGUÉM contando tempo
bun ../cli/askuser.ts "t" -o "a|um" -o "b|dois" -t 0.05 --json   # exit 3
```

O que cada um prova: `0` que o ciclo fecha, `409` que o guard existe, `3` que o
vencimento não depende de processo. Matar o servidor e subir de novo prova o
RocksDB — a pergunta volta do disco.

## O CLI de fora

Este repo é standalone. Um CLI de terceiro pode embrulhar `scripts/cli/askuser.ts`
— o `my askuser ask` da casa `~/src/me` faz isso, e é só um wrapper: a lógica
mora aqui.
