# askuser — uma peça só

**Sem Docker. Sem serviço. Sem daemon.** Um processo Next, com RocksDB embutido.

```bash
bun install
bun run dev            # 5311
```

É isso. O banco é uma pasta (`.data/askuser`) criada na primeira escrita.

## Por que voltou pra uma peça

Este app já teve Convex (Docker) e Inngest (binário). Três processos pra uma
pergunta existir, e a consequência é dura: **com qualquer um fora, o agente não
perguntava**. Um app cujo trabalho é destravar agente não pode ter três formas
de estar quebrado.

Hoje: se o Next está de pé, perguntar funciona.

| antes | agora |
|---|---|
| Convex em Docker (3210/3211/6791) | RocksDB embutido, uma pasta |
| Inngest single binary (8288) | `expiraEm` gravado, avaliado na leitura |
| subscrição reativa do Convex | SSE de um `EventEmitter` local |
| `docker compose up` + admin key + codegen | `bun run dev` |

## O tempo, sem relógio

O Inngest existia pra expirar pergunta que ninguém respondeu, e o argumento
contra `setTimeout` era real: o timer morre com o processo e as perguntas ficam
abertas pra sempre.

A resposta aqui não é um timer melhor — é **não depender de timer**. `expiraEm`
está no registro, e toda leitura trata como expirada a pergunta cujo prazo
passou. O disco é a verdade. Reiniciar não perde nada porque não havia nada em
memória pra perder.

## As quatro saídas do CLI

`0` escolheu · `2` pulou · `3` expirou · `1` erro.

Pular e expirar são ESTADOS, não `resposta` vazia: "não quis decidir", "o tempo
acabou" e "escolheu a opção 0" são três fatos diferentes, e quem chamou precisa
distinguir os três sem adivinhar.

```bash
my askuser ask "Disparo as 4 unidades?" \
  -o "faz|4 agentes · ~12 min de parede" \
  -o "espera|primeiro decido a S5"
```

`ASKUSER_URL` aponta o CLI pra outra máquina; `ASKUSER_DB` move o banco.

## O que este app NÃO tem

- **Autenticação.** Roda na rede do Gabriel. É decisão, não esquecimento, e ela
  vence no dia em que a tela sair de casa.
- **Histórico.** A tela mostra só o que está ABERTO. Pergunta decidida não é
  trabalho de ninguém.
- **Texto livre.** Só escolha entre opções.
- **Escala.** `listOpen` lê o prefixo inteiro e filtra em memória. Barato
  enquanto "aberto" for dezenas; se virar milhares, a saída é um segundo prefixo
  mantido junto — escrita dupla, custo que ainda não se paga.
