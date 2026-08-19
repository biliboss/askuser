---
name: askuser
description: Pergunta pra uma PESSOA de dentro de um script e espera a decisão. Use quando um processo automatizado precisa de uma escolha humana e não pode simplesmente supor — a pergunta aparece numa tela que a pessoa está olhando, e o comando bloqueia até haver resposta. Quatro saídas: escolheu (0), pulou (2), expirou (3), erro (1).
---

# askuser

Um script pergunta, uma pessoa decide, o script continua.

```bash
askuser "Disparo as 4 unidades?" \
  -o "faz|4 agentes em paralelo · ~12 min de parede" \
  -o "espera|primeiro decido a S5"
```

A pergunta aparece no app (aba do navegador, celular, ou a janela desktop), e o
comando fica **bloqueado** até alguém decidir.

## Leia o código de saída, não só o stdout

```
0  escolheu   → {"estado":"ANSWERED","escolha":"faz","indice":0,...}
2  PULOU      → a pessoa viu e decidiu não decidir agora
3  EXPIROU    → o prazo acabou e ninguém respondeu
1  erro       → o app não respondeu, ou a chamada estava errada
```

**Tratar 2 ou 3 como 0 é o erro que este comando existe pra impedir.** Seguir
adiante depois de um pulo ou de um vencimento é agir sobre uma decisão que
ninguém tomou. O caminho honesto é parar e registrar que ficou pendente.

E `1` é diferente dos outros três de propósito: significa "não consegui
perguntar", não "perguntei e ninguém respondeu".

```bash
askuser "…" -o "a|…" -o "b|…" --json
case $? in
  0) ;;                                   # tem decisão
  2) echo "pendente: pulado" ;;
  3) echo "pendente: expirou" ;;
  1) echo "o app não está de pé" ;;
esac
```

## As opções

`-o "<rótulo>|<descrição>"`, repetido. **Mínimo duas** — uma opção só é um
`enter` disfarçado de decisão, e o comando recusa.

A descrição é onde vai a CONSEQUÊNCIA, não o sinônimo do rótulo. Compare:

```
-o "faz|executa"                      ruim: não diz nada novo
-o "faz|4 agentes · ~12 min de parede"  bom: é o número que decide
```

## As flags

| flag | o que faz |
|---|---|
| `-o, --opcao` | uma opção; repita. Mínimo 2 |
| `-t, --minutos` | quanto ela vive antes de expirar (padrão 30) |
| `--json` | só o JSON, sem a linha legível |

## O ambiente

| var | pra quê |
|---|---|
| `ASKUSER_URL` | onde o app atende (padrão `http://127.0.0.1:5311`) |
| `ASKUSER_AGENT` · `ASKUSER_RUN` · `ASKUSER_PANE` | a ORIGEM, que aparece na tela |

**Preencha a origem.** Quem vê a pergunta precisa saber de onde ela veio pra
decidir — pergunta órfã é decisão tomada sobre um contexto que ninguém consegue
reconstruir.

## Subir o app

```bash
cd scripts/ui && bun install && bun run start     # 5311
```

Uma peça só: Next com RocksDB embutido, sem Docker e sem daemon. O banco nasce
sozinho em `scripts/ui/.data/askuser`.

Janela desktop, opcional — `scripts/desktop/`, uma casca que abre a mesma tela
sempre por cima.

## Quando NÃO usar

- **Pra avisar.** Isto bloqueia; notificação não bloqueia.
- **Pra coletar texto.** Só escolha entre opções.
- **Quando você pode decidir sozinho.** Perguntar custa a atenção de alguém, e
  esse é o recurso mais caro do sistema. Se o disco responde, leia o disco.
