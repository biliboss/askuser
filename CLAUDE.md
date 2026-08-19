# askuser — o porquê

**Um script pergunta pra uma pessoa e ESPERA a resposta.** Só isso. O que existe
aqui existe pra que essa espera não seja silenciosa.

## O problema, dito com precisão

Um processo automatizado que precisa de uma decisão humana costuma perguntar no
lugar onde ele mesmo roda: um terminal, um pane de tmux, um log. Se ninguém está
olhando ali — e quase nunca está —, ele espera em **silêncio**.

De fora, esperar resposta é **indistinguível de estar trabalhando**. Ninguém sabe
que há uma decisão parada. E quando alguém finalmente olha, o contexto da
pergunta é de horas atrás: decisão tomada tarde sobre um estado que já mudou é
decisão errada com cara de decisão.

A solução comum é proibir: "processo automatizado não pergunta". Isso funciona e
custa caro — todo caso que precisaria de uma decisão vira ou uma suposição, ou um
trabalho abandonado no meio.

`askuser` ataca a causa: **se a pergunta alcança a pessoa sozinha, o processo
pode perguntar de onde estiver.**

## As três decisões que definem este projeto

### 1. Quatro saídas, não duas

```
0  escolheu    2  PULOU    3  EXPIROU    1  erro
```

`pulou` e `expirou` são estados de primeira classe, nunca uma `resposta` vazia.
"Não quis decidir agora", "o tempo acabou" e "escolheu a primeira opção" são três
fatos diferentes, e quem chamou precisa distinguir os três **sem adivinhar**.

Um script que trata 2 ou 3 como 0 segue adiante com uma decisão que ninguém
tomou. É o pior desfecho possível, e é o que a maioria das APIs de prompt
permite por omissão.

**PULAR não é conforto.** Sem essa saída, a pessoa que não quer decidir agora
responde qualquer coisa só pra a tela sumir — e resposta dada pra calar a
pergunta parece uma decisão sem ser uma.

### 2. O prazo é DADO, não processo

Uma pergunta que ninguém vê não pode ficar aberta pra sempre — seria o mesmo
defeito que o projeto existe pra resolver, só que na outra ponta.

A resposta **não** é um timer. Timer mora no processo: um restart, um deploy, um
crash, e o relógio de toda pergunta aberta some sem ninguém notar. As perguntas
voltam a ficar abertas pra sempre, e o defeito volta disfarçado de "está
funcionando".

`expiraEm` é gravado com a pergunta, e **toda leitura** trata como vencida a
pergunta cujo prazo passou. O disco é a verdade. Reiniciar não perde nada porque
não havia nada em memória pra perder.

### 3. Uma peça

Este projeto já teve um banco em Docker e um orquestrador de workflows ao lado.
Três processos pra uma pergunta existir, e a consequência é dura: **com qualquer
um fora, o processo não conseguia perguntar.** Uma ferramenta cujo trabalho é
destravar quem espera não pode ter três formas de estar quebrada.

Hoje é um processo Next com RocksDB embutido. Se ele está de pé, perguntar
funciona. E quando ele NÃO está, o CLI sai com `1` e uma mensagem que diz o que
subir — porque "não consegui perguntar" tem que ser distinguível de "perguntei e
ninguém respondeu".

### 4. A tela é uma, as superfícies são várias

Navegador, celular, e uma janela nativa opcional — todas carregam **a mesma
tela**. Nenhuma tem frontend próprio, porque duplicar criaria uma segunda verdade
que diverge na primeira edição.

A janela usa **Neutralino** (WebView do sistema, ~2MB). Tauri e Electrobun foram
tentados e apagados em 19/08: o primeiro pedia toolchain Rust e ~1GB de `target/`,
o segundo 107M de `node_modules`. Os dois contradiziam a decisão 3 pra entregar um
enfeite, e contradizer a própria tese é o que ninguém percebe até virar
manutenção.

O que a janela acrescenta é a única coisa que o navegador não dá: ficar por cima.
Uma aba atrás de outras quinze é o problema deste projeto de volta.

## O que este projeto NÃO é

- **Não é notificação.** Notificação avisa; isto BLOQUEIA até haver decisão.
- **Não é formulário.** Só escolha entre opções, nunca texto livre. Campo aberto
  num popup que interrompe é onde a resposta vira uma frase que ninguém parseia.
- **Não é fila de trabalho.** Uma pergunta é uma decisão pendente, não uma task.
- **Não tem autenticação.** Roda na sua rede. É decisão, não esquecimento, e ela
  vence no dia em que a tela sair de casa.

## Como se mexe nele

`CONTEXT.md`.
