# PRD: Sistema de Webhooks de Notificação de Pedidos

Versão: 1.0 · Data: 2026-07-03 · Responsável: Eloi Gonçalves

## Resumo e contexto da feature

O OMS passará a notificar clientes B2B, via webhooks outbound, sempre que o status de um pedido mudar, eliminando a necessidade de eles fazerem polling no `GET /orders`. A solução usa outbox transacional, worker em polling, retry/backoff, DLQ e entrega assinada com HMAC-SHA256. Este PRD consolida o "por quê" e o "o quê"; o "como" está no [FDD](FDD.md) e nos [ADRs](adrs/).

## Problema e motivação

Três clientes B2B (Atlas Comercial, MaxDistribuição e Nova Cargo) pediram formalmente para serem notificados em tempo real sobre mudanças de status de pedidos (`[09:00] Marcos`). Hoje eles fazem polling no `GET /orders`, o que torna a integração lenta e cara (`[09:00] Marcos`). Para eles, "tempo real" é qualquer latência abaixo de 10 segundos (`[09:02] Marcos`). A Atlas indicou que pode migrar para o concorrente se a feature não sair até o fim do trimestre, criando risco de churn (`[09:00] Marcos`).

## Público-alvo e cenários de uso

- **Clientes B2B integradores** (Atlas, MaxDistribuição, Nova Cargo): cadastram endpoints e recebem notificações assinadas para reagir a mudanças de status (`[09:00] Marcos`, `[09:31] Marcos`).
- **Operadores da plataforma:** gerenciam a configuração de webhooks via API autenticada (`[09:32] Marcos`).
- **Administradores:** reprocessam eventos da DLQ quando necessário (`[09:35] Diego`, `[09:36] Sofia`).

Cenário típico: um pedido muda de `PROCESSING` para `SHIPPED`; em até ~2s o worker entrega o evento assinado ao endpoint da Atlas, que atualiza o sistema dela sem polling.

## Objetivos e métricas de sucesso

| Objetivo | Métrica | Meta |
| --- | --- | --- |
| Notificar mudança de status quase em tempo real | Latência da notificação | < 10s para cliente saudável (`[09:02] Marcos`, `[09:10] Larissa`) |
| Reduzir polling dos clientes | Chamadas `GET /orders` de integração | Redução significativa |
| Entregar de forma confiável | Taxa de eventos entregues (incl. após retry) antes da DLQ | Alta; DLQ só após 5 tentativas em ~15h (`[09:17] Diego`) |
| Garantir integridade e origem | Percentual de entregas assinadas com HMAC-SHA256 | 100% (`[09:20] Sofia`) |

## Escopo

### Incluso
- CRUD de configuração de webhook (cadastrar, editar, remover, listar).
- Filtro de eventos por status desejado por endpoint.
- Histórico de deliveries por webhook.
- Geração e rotação de secret com grace period de 24h.
- Emissão transacional do evento no `changeStatus`.
- Entrega assinada com retry/backoff e DLQ com replay admin.

### Fora de escopo
- **Notificação por email quando o webhook do cliente falha:** adiado para a próxima fase, após medir impacto (`[09:37] Larissa`, `[09:38] Marcos`).
- **Rate limiting de saída:** adiado, observar e decidir depois (`[09:38] Diego`, `[09:39] Larissa`).
- **Dashboard/painel visual para o cliente:** descartado, projeto do time de frontend (`[09:39] Marcos`, `[09:40] Larissa`).
- **Ordering global / múltiplos workers:** limitação conhecida, adiada (`[09:12] Diego`, `[09:13] Larissa`).
- **Webhooks inbound (cliente para nós):** descartado, escopo é só outbound (`[09:02] Sofia`, `[09:02] Marcos`).

## Requisitos funcionais

| ID | Nome | Descrição | Prioridade |
| --- | --- | --- | --- |
| FR-001 | Cadastrar webhook | `POST` autenticado com `url`, `customerId` (body/path) e lista de status; secret gerada pela plataforma e devolvida na criação (`[09:31] Marcos`, `[09:32] Larissa`) | Alta |
| FR-002 | Editar webhook | `PATCH` para alterar a configuração do endpoint (`[09:33] Bruno`) | Alta |
| FR-003 | Remover webhook | `DELETE` para remover o endpoint (`[09:33] Bruno`) | Alta |
| FR-004 | Listar webhooks do customer | `GET` para listar os webhooks de um customer (`[09:33] Bruno`) | Alta |
| FR-005 | Filtro de eventos por endpoint | Cada webhook escolhe quais status quer ouvir; filtro aplicado na inserção da outbox (`[09:33] Marcos`, `[09:34] Bruno`) | Alta |
| FR-006 | Histórico de deliveries | `GET /webhooks/:id/deliveries` com últimas entregas: sucesso/falha, payload, response, tempo de resposta (`[09:34] Marcos`) | Média |
| FR-007 | Replay de DLQ (admin) | `POST /admin/webhooks/dead-letter/:id/replay`, role ADMIN, recoloca na outbox e loga quem fez (`[09:35] Diego`, `[09:36] Sofia`) | Média |
| FR-008 | Geração e rotação de secret | Secret gerada pela plataforma; endpoint para pedir nova secret; antiga válida por 24h em paralelo (`[09:21] Sofia`, `[09:22] Sofia`) | Alta |
| FR-009 | Emissão transacional do evento | Inserção na `webhook_outbox` dentro da transação do `changeStatus`; se a outbox falhar, rollback (`[09:40] Bruno`, `[09:41] Diego`) | Alta |
| FR-010 | Entrega assinada ao cliente | Worker envia `POST` com payload JSON assinado (HMAC-SHA256) e headers `X-Event-Id`/`X-Signature`/`X-Timestamp`/`X-Webhook-Id` (`[09:20] Sofia`, `[09:44] Diego`) | Alta |

## Requisitos não funcionais

| ID | Requisito | Descrição |
| --- | --- | --- |
| RNF-01 | TLS obrigatório | URL do webhook deve ser `https`; `http` é recusado na validação Zod (`[09:23] Sofia`) |
| RNF-02 | Limite de payload 64KB | Evento acima de 64KB gera erro, não trunca (`[09:23] Sofia`, `[09:24] Larissa`) |
| RNF-03 | Timeout HTTP de 10s | Envio que passa de 10s é falha e vai para retry (`[09:42] Diego`) |
| RNF-04 | Garantia at-least-once | Cliente pode receber o mesmo evento mais de uma vez e deduplica por `X-Event-Id` (`[09:24] Diego`, `[09:25] Diego`) |
| RNF-05 | Observabilidade via Pino | Logging estruturado do worker/entregas com `redact` de secret/token (`[09:29] Bruno`) |
| RNF-06 | Auditoria do replay | Endpoint admin de replay registra quem executou (`[09:36] Sofia`) |

## Decisões e trade-offs principais

- Outbox transacional no MySQL em vez de fila externa ou disparo síncrono. Ver [ADR-001](adrs/ADR-001-outbox-no-mysql.md).
- Retry com backoff 1m/5m/30m/2h/12h e DLQ separada. Ver [ADR-002](adrs/ADR-002-retry-backoff-e-dlq.md).
- HMAC-SHA256 com secret por endpoint e rotação com grace de 24h. Ver [ADR-003](adrs/ADR-003-hmac-sha256-secret-por-endpoint.md).
- Garantia at-least-once com `X-Event-Id`. Ver [ADR-004](adrs/ADR-004-at-least-once-x-event-id.md).
- Worker em processo separado com polling de 2s. Ver [ADR-005](adrs/ADR-005-worker-separado-polling.md).
- Reuso dos padrões existentes do projeto. Ver [ADR-006](adrs/ADR-006-reuso-padroes-do-projeto.md).
- Snapshot do payload na inserção. Ver [ADR-007](adrs/ADR-007-snapshot-do-payload-na-outbox.md).

## Dependências

- Infraestrutura MySQL e Prisma existentes; novas tabelas de webhook (`[09:07] Diego`, `[09:51] Larissa`).
- Módulo `crypto` nativo do Node para o HMAC (`[09:20] Sofia`).
- Alteração no `changeStatus` do módulo de pedidos (`[09:40] Bruno`).
- Novo processo/worker e script `npm run worker` (`[09:11] Larissa`).
- Janela de revisão de segurança da Sofia antes do deploy (`[09:46] Sofia`).

## Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
| --- | --- | --- | --- |
| Vazamento de secret do cliente | Média | Alto | Secret por endpoint e rotação com grace de 24h; `redact` no logger (`[09:21] Sofia`, `[09:22] Diego`) |
| Cliente indisponível por horas perde eventos | Média | Alto | 5 tentativas com backoff até ~15h e DLQ com replay manual (`[09:17] Diego`, `[09:18] Diego`) |
| Regressão na transação de mudança de status | Baixa | Alto | Inserção na outbox dentro do `tx`; testes ponta a ponta e revisão da Sofia (`[09:41] Diego`, `[09:46] Sofia`) |
| Entregas fora de ordem ao escalar workers | Baixa | Médio | Single-worker por enquanto; particionar por `order_id` no futuro (`[09:13] Diego`) |

## Critérios de aceitação

- Cliente consegue cadastrar, editar, listar e remover webhooks autenticado.
- Mudança de status gera evento na outbox dentro da mesma transação.
- Evento é entregue assinado em menos de 10s para cliente saudável.
- Falhas seguem o backoff definido e vão para a DLQ após 5 tentativas.
- Replay da DLQ funciona apenas para role ADMIN e é auditado.
- URLs não `https` e payloads acima de 64KB são recusados.

## Estratégia de testes e validação

- Testes unitários dos schemas Zod (URL `https`, limite de 64KB) e das classes de erro `WEBHOOK_*`.
- Testes de integração do `changeStatus` garantindo inserção transacional e rollback em falha da outbox.
- Testes do worker cobrindo sucesso, retry com backoff e movimentação para DLQ.
- Teste ponta a ponta de entrega assinada (verificação do HMAC-SHA256 e dos headers).
- Revisão de segurança da geração/rotação de secret e do HMAC antes do deploy (`[09:46] Sofia`).
