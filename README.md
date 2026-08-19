# askuser

**Seu script pergunta. Uma pessoa decide. O script continua.**

```bash
askuser "Disparo as 4 unidades?" \
  -o "faz|4 agentes em paralelo · ~12 min de parede" \
  -o "espera|primeiro decido a S5"
```

O comando **bloqueia**. A pergunta aparece numa tela que alguém está olhando —
navegador, celular, o que estiver aberto. Quando a pessoa decide, o script segue
com a resposta.

---

## O problema

Seu processo automatizado precisa de uma decisão humana. Ele pergunta onde ele
mesmo roda: um terminal, um pane, um log.

Ninguém está olhando ali.

Então ele espera. E aqui está a parte cara: **de fora, esperar resposta é
idêntico a estar trabalhando.** Ninguém sabe que existe uma decisão parada.
Quando alguém finalmente olha, o contexto é de horas atrás — e decisão tomada
tarde sobre um estado que já mudou é decisão errada com cara de decisão.

A saída comum é proibir: "processo automatizado não pergunta". Funciona, e cobra
caro: todo caso que precisaria de uma decisão vira uma suposição, ou um trabalho
abandonado no meio.

`askuser` resolve pela causa. **Se a pergunta alcança a pessoa sozinha, o
processo pode perguntar de onde estiver.**

---

## Quatro saídas, não duas

É o que separa isto de qualquer prompt.

```
0   escolheu
2   PULOU      — a pessoa viu e decidiu não decidir agora
3   EXPIROU    — o prazo acabou e ninguém respondeu
1   erro       — não consegui perguntar
```

`pulou` e `expirou` são estados de primeira classe. Nunca uma resposta vazia.

**"Não quis decidir agora", "o tempo acabou" e "escolheu a primeira opção" são
três fatos diferentes.** Um script que trata 2 ou 3 como 0 segue adiante com uma
decisão que ninguém tomou. É o pior desfecho possível — e é o que a maioria das
APIs de prompt permite por omissão.

```bash
askuser "Deploy agora?" -o "vai|sobe pra produção" -o "espera|amanhã de manhã"
case $? in
  0) deploy ;;
  2) echo "pendente: pulado" ;;
  3) echo "pendente: expirou" ;;
  1) echo "o app não está de pé" ;;
esac
```

**PULAR não é conforto.** Sem essa saída, quem não quer decidir agora clica
qualquer coisa só pra a tela sumir. E resposta dada pra calar a pergunta parece
uma decisão sem ser uma.

---

## Uma peça

Sem Docker. Sem daemon. Sem broker. Sem binário ao lado.

```bash
cd scripts/ui && bun install && bun run start     # 5311
```

Um processo Next com **RocksDB embutido**. O banco é uma pasta, criada sozinha na
primeira escrita.

Este projeto já teve banco em container e orquestrador de workflow ao lado. Três
processos pra uma pergunta existir — o que significa **três formas de estar
quebrado**. Uma ferramenta cujo trabalho é destravar quem espera não pode ter
isso.

Hoje: se o app está de pé, perguntar funciona. E quando ele não está, você recebe
`1` com a mensagem do que subir — porque *"não consegui perguntar"* precisa ser
diferente de *"perguntei e ninguém respondeu"*.

### A janela, se você quiser

```bash
bun scripts/askuser.ts
```

**Neutralino**: WebView do sistema, binário de ~2MB baixado uma vez. Sem Rust,
sem Chromium, sem runtime embutido.

Ela carrega a mesma tela do navegador. O que acrescenta é **ficar por cima de
tudo** — porque uma aba atrás de outras quinze é o mesmo problema de ninguém ver
a pergunta.

E ela **não está no caminho**: o app funciona sem ela, o CLI funciona sem ela.

---

## O prazo é dado, não processo

Uma pergunta que ninguém vê não pode ficar aberta pra sempre. Seria o mesmo
defeito, só que na outra ponta.

A resposta **não é um timer**. Timer mora no processo: um restart, um deploy, um
crash — e o relógio de toda pergunta aberta some sem ninguém notar. As perguntas
voltam a ficar abertas pra sempre, e o defeito volta disfarçado de "está
funcionando".

`expiraEm` é gravado junto com a pergunta, e **toda leitura** trata como vencida
a que passou do prazo. O disco é a verdade. Reiniciar não perde nada, porque não
havia nada em memória pra perder.

---

## Uso

| flag | |
|---|---|
| `-o, --opcao "<rótulo>\|<descrição>"` | uma opção; repita. **Mínimo 2** |
| `-t, --minutos <n>` | quanto ela vive antes de expirar (padrão 30) |
| `--json` | só o JSON, sem a linha legível |

A descrição carrega a **consequência**, não o sinônimo do rótulo:

```
-o "faz|executa"                        não diz nada novo
-o "faz|4 agentes · ~12 min de parede"  é o número que decide
```

Uma opção só é recusada. Um `enter` disfarçado de decisão interrompe alguém pra
nada — e a atenção de quem decide é o recurso mais caro do sistema.

### Ambiente

| | |
|---|---|
| `ASKUSER_URL` | onde o app atende (padrão `http://127.0.0.1:5311`) |
| `ASKUSER_AGENT` · `ASKUSER_RUN` · `ASKUSER_PANE` | a origem, que aparece na tela |

**Preencha a origem.** Quem vê a pergunta precisa saber de onde ela veio pra
poder decidir. Pergunta órfã é decisão tomada sobre um contexto que ninguém
consegue reconstruir.

---

## Como skill

`SKILL.md` está na raiz. Clone e aponte:

```bash
git clone https://github.com/biliboss/askuser ~/src/askuser
ln -s ~/src/askuser ~/.claude/skills/askuser
```

---

## Quando não usar

- **Pra avisar.** Isto bloqueia; notificação não bloqueia.
- **Pra coletar texto.** Só escolha entre opções. Campo aberto num popup que
  interrompe é onde a resposta vira uma frase que ninguém parseia.
- **Quando você pode decidir sozinho.** Se o disco responde, leia o disco.

## O que ele não tem

- **Autenticação.** Roda na sua rede. É decisão, não esquecimento — e ela vence
  no dia em que a tela sair de casa.
- **Histórico.** A tela mostra só o que está aberto.
- **Escala.** A lista lê o prefixo inteiro e filtra em memória. Barato enquanto
  "aberto" for dezenas.

---

O porquê de cada decisão está em [`CLAUDE.md`](CLAUDE.md).
Como se mexe, em [`CONTEXT.md`](CONTEXT.md).

MIT.
