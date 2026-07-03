# Da Reunião ao Documento: Design Docs Gerados por IA

> Pacote de design docs (PRD, RFC, FDD, ADRs, Tracker) produzido a partir de uma transcrição de reunião técnica e do código de um Order Management System, usando IA como ferramenta principal de produção.

## Sobre o desafio

O ponto de partida foi uma única fonte de verdade humana: a transcrição literal (`TRANSCRICAO.md`) de uma reunião de 55 minutos em que tech lead, PM e engenheiros fecharam a arquitetura de um Sistema de Webhooks de Notificação de Pedidos para um OMS que já roda em produção. Nada além dessa call foi registrado. O trabalho consistiu em transformar essa conversa, somada à leitura do código existente, em um pacote de documentação técnica acionável o suficiente para o time começar a codar.

A regra central foi a rastreabilidade: nenhum requisito, decisão ou restrição pode existir nos documentos sem uma origem identificável na transcrição (`[hh:mm] Nome`) ou em um caminho de arquivo real do código. Identificar o que a reunião descartou (email de falha, dashboard, rate limiting de saída, webhooks inbound) foi tão importante quanto capturar o que entrou.

## Ferramentas de IA utilizadas

- **GitHub Copilot (agente no VS Code)**: exploração do código (mapeamento de `changeStatus`, máquina de estados, classes de erro, logger), geração dos documentos um a um e revisão crítica final contra a transcrição e o repositório.

## Workflow adotado

A produção seguiu a ordem: **contextualização → mapa de decisões → ADRs → RFC → FDD → PRD → Tracker → README → revisão crítica**.

A ordem não é arbitrária. Primeiro dois artefatos de trabalho em `docs/_work/` (o `context-brief.md`, que mapeia o código, e o `decision-map.md`, que destila a transcrição separando o que entra do que foi descartado) formaram a base auditável. Sobre eles, os **ADRs** vieram primeiro porque as decisões fechadas são o esqueleto do "como implementar". O **RFC** consolidou a proposta em nível de arquitetura, linkando os ADRs em vez de repetir o raciocínio. O **FDD** desceu ao detalhe de implementação (fluxos, contratos, matriz de erros, integração com o código). O **PRD** veio depois como consolidação de produto. O **Tracker** amarrou cada item à sua origem, e o **README** documentou o processo.

A interação com a IA foi organizada em fases de planejamento e execução, **um documento por vez**, para não estourar o contexto e manter cada peça na sua "altura" (produto, arquitetura, decisão, implementação), evitando duplicação entre documentos.

## Prompts customizados

### Prompt 1: mapa de decisões (filtragem do que entra vs. o que sai)

```
Você é um analista técnico destilando a TRANSCRICAO.md em um mapa auditável.
Separe rigorosamente o que ENTRA (decidido) do que NÃO entra (adiado/descartado).
Cada item precisa ter origem [hh:mm] Nome. Produza:
1. Decisões arquiteturais principais (candidatas a ADR), cada uma com a
   alternativa descartada e o trade-off que motivou o descarte.
2. Requisitos funcionais e não funcionais, com prioridade e origem.
3. Uma seção FORA DE ESCOPO / ADIADO: nenhum desses itens pode aparecer como
   requisito. Inclua email de falha, rate limiting de saída, dashboard visual,
   ordering global e webhooks inbound, cada um com o timestamp que os descartou.
Marque como HIPÓTESE qualquer inferência não dita literalmente na reunião.
```

### Prompt 2: geração do FDD com a seção obrigatória de integração

```
Você é um engenheiro sênior escrevendo o FDD do Sistema de Webhooks para um dev
que vai codar amanhã. Regras invioláveis:
- Códigos de erro sempre com prefixo WEBHOOK_ (ex.: WEBHOOK_NOT_FOUND,
  WEBHOOK_INVALID_URL, WEBHOOK_PAYLOAD_TOO_LARGE).
- Pelo menos 4 endpoints HTTP com request + response + status codes, mais o
  request OUTBOUND com os headers X-Event-Id, X-Signature, X-Timestamp,
  X-Webhook-Id e o payload (event_type "order.status_changed", ISO 8601, etc.).
- Seção obrigatória "Integração com o sistema existente" nomeando >= 4 arquivos
  reais (order.service.ts, order.status.ts, http-errors.ts, error.middleware.ts,
  auth.middleware.ts, logger, server.ts, schema.prisma) e COMO integrar com cada.
- Observabilidade deve citar métricas, logs (Pino com redact) E tracing.
- Não repita a discussão de decisão (isso é ADR/RFC); só implemente. Sem travessões.
```

## Iterações e ajustes

1. **ADRs genéricos demais na primeira passada.** A geração inicial trouxe a política de retry sem os parâmetros exatos. Ajustei o prompt para exigir os valores fechados na reunião (5 tentativas, backoff `1m/5m/30m/2h/12h`) e a alternativa descartada de "3 tentativas", com o trade-off literal de `[09:16] Diego` (não cobre indisponibilidade de 2h de manutenção planejada).
2. **Item fora de escopo vazando como requisito.** Uma versão inicial do PRD listou "notificação por email quando o webhook falha" como requisito funcional. Removi porque a reunião marcou email como futuro em `[09:37] Larissa` e `[09:38] Marcos`. O mesmo controle foi aplicado a dashboard, rate limiting de saída e webhooks inbound.
3. **Duplicação de altura entre RFC e FDD.** O RFC começou a incluir payloads e matriz de erros; movi todo esse detalhe para o FDD e deixei o RFC apenas com a proposta em alto nível referenciando os ADRs, mantendo-o conciso.
4. **Máquina de estados conferida contra o código.** Validei que os documentos descrevem `SHIPPED → [DELIVERED]` como estado atual, batendo 1:1 com o mapa `transitions` de `src/modules/orders/order.status.ts`, sem antecipar transições da Fase 2.

## Como navegar a entrega

Ordem sugerida de leitura:

1. [docs/PRD.md](docs/PRD.md): o "por quê e o quê" (produto).
2. [docs/RFC.md](docs/RFC.md): a proposta técnica em alto nível.
3. [docs/adrs/](docs/adrs/): as decisões arquiteturais isoladas (ADR-001 a ADR-007).
4. [docs/FDD.md](docs/FDD.md): o "como construir" em detalhe, incluindo a integração com o código.
5. [docs/TRACKER.md](docs/TRACKER.md): a rastreabilidade de cada item à sua origem.

Artefatos de trabalho (contexto de apoio): [docs/_work/context-brief.md](docs/_work/context-brief.md) e [docs/_work/decision-map.md](docs/_work/decision-map.md).

## Enunciado original

O enunciado original do desafio foi preservado em [docs/DESAFIO.md](docs/DESAFIO.md). O repositório base é https://github.com/devfullcycle/mba-ia-desafio-design-docs-com-ia.
