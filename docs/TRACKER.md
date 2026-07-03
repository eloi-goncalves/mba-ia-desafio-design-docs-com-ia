# Tracker de Rastreabilidade

> Cada item dos design docs mapeado à sua origem na transcrição da reunião ou no código.

| ID | Documento | Tipo | Conteúdo (resumo) | Fonte | Localização |
| --- | --- | --- | --- | --- | --- |
| PRD-FR-01 | docs/PRD.md | Requisito Funcional | Cadastro de webhook via POST, secret devolvida | TRANSCRICAO | [09:31] Marcos |
| PRD-FR-02 | docs/PRD.md | Requisito Funcional | Editar webhook via PATCH | TRANSCRICAO | [09:33] Bruno |
| PRD-FR-03 | docs/PRD.md | Requisito Funcional | Remover webhook via DELETE | TRANSCRICAO | [09:33] Bruno |
| PRD-FR-04 | docs/PRD.md | Requisito Funcional | Listar webhooks do customer via GET | TRANSCRICAO | [09:33] Bruno |
| PRD-FR-05 | docs/PRD.md | Requisito Funcional | Filtro de eventos por status na inserção da outbox | TRANSCRICAO | [09:34] Bruno |
| PRD-FR-06 | docs/PRD.md | Requisito Funcional | Histórico de deliveries por webhook | TRANSCRICAO | [09:34] Marcos |
| PRD-FR-07 | docs/PRD.md | Requisito Funcional | Replay de DLQ, role ADMIN, auditado | TRANSCRICAO | [09:35] Diego |
| PRD-FR-08 | docs/PRD.md | Requisito Funcional | Geração e rotação de secret com grace de 24h | TRANSCRICAO | [09:21] Sofia |
| PRD-FR-09 | docs/PRD.md | Requisito Funcional | Emissão transacional do evento no changeStatus | TRANSCRICAO | [09:40] Bruno |
| PRD-FR-10 | docs/PRD.md | Requisito Funcional | Entrega assinada com HMAC e headers | TRANSCRICAO | [09:44] Diego |
| PRD-RNF-01 | docs/PRD.md | Requisito Não Funcional | URL do webhook deve ser https | TRANSCRICAO | [09:23] Sofia |
| PRD-RNF-02 | docs/PRD.md | Requisito Não Funcional | Limite de payload 64KB, erro se exceder | TRANSCRICAO | [09:24] Diego |
| PRD-RNF-03 | docs/PRD.md | Requisito Não Funcional | Timeout HTTP de 10s | TRANSCRICAO | [09:42] Diego |
| PRD-RNF-04 | docs/PRD.md | Requisito Não Funcional | Garantia at-least-once, dedup por X-Event-Id | TRANSCRICAO | [09:24] Diego |
| PRD-RNF-05 | docs/PRD.md | Requisito Não Funcional | Observabilidade via Pino com redact | CODIGO | src/shared/logger/index.ts |
| PRD-RNF-06 | docs/PRD.md | Requisito Não Funcional | Auditoria do replay (quem executou) | TRANSCRICAO | [09:36] Sofia |
| PRD-OBJ-01 | docs/PRD.md | Métrica | Latência da notificação < 10s | TRANSCRICAO | [09:02] Marcos |
| PRD-RISK-01 | docs/PRD.md | Risco | Vazamento de secret do cliente | TRANSCRICAO | [09:22] Diego |
| PRD-RISK-02 | docs/PRD.md | Risco | Cliente indisponível por horas | TRANSCRICAO | [09:16] Diego |
| PRD-OOS-01 | docs/PRD.md | Fora de escopo | Email de falha adiado | TRANSCRICAO | [09:37] Larissa |
| PRD-OOS-02 | docs/PRD.md | Fora de escopo | Dashboard visual descartado | TRANSCRICAO | [09:40] Larissa |
| RFC-PROP-01 | docs/RFC.md | Proposta | Outbox transacional no MySQL | TRANSCRICAO | [09:06] Diego |
| RFC-PROP-02 | docs/RFC.md | Proposta | Worker separado em polling de 2s | TRANSCRICAO | [09:09] Diego |
| RFC-ALT-01 | docs/RFC.md | Alternativa descartada | Disparo síncrono no changeStatus | TRANSCRICAO | [09:04] Bruno |
| RFC-ALT-02 | docs/RFC.md | Alternativa descartada | Redis Streams / fila externa | TRANSCRICAO | [09:07] Diego |
| RFC-ALT-03 | docs/RFC.md | Alternativa descartada | Exactly-once / trigger de banco | TRANSCRICAO | [09:25] Diego |
| RFC-QA-01 | docs/RFC.md | Questão em aberto | Rate limiting de saída | TRANSCRICAO | [09:39] Larissa |
| RFC-QA-02 | docs/RFC.md | Questão em aberto | Ordering ao escalar múltiplos workers | TRANSCRICAO | [09:13] Diego |
| RFC-QA-03 | docs/RFC.md | Questão em aberto | Email de notificação de falha | TRANSCRICAO | [09:38] Marcos |
| RFC-QA-04 | docs/RFC.md | Questão em aberto | Endurecimento de roles no CRUD | TRANSCRICAO | [09:37] Sofia |
| FDD-INT-01 | docs/FDD.md | Decisão de Integração | Inserção na outbox dentro do tx do changeStatus | CODIGO | src/modules/orders/order.service.ts |
| FDD-INT-02 | docs/FDD.md | Decisão de Integração | Transições válidas definem eventos possíveis | CODIGO | src/modules/orders/order.status.ts |
| FDD-INT-03 | docs/FDD.md | Decisão de Integração | Erros WEBHOOK_* estendem AppError | CODIGO | src/shared/errors/http-errors.ts |
| FDD-INT-04 | docs/FDD.md | Decisão de Integração | Serialização de erro sem alteração | CODIGO | src/middlewares/error.middleware.ts |
| FDD-INT-05 | docs/FDD.md | Decisão de Integração | requireRole('ADMIN') no replay | CODIGO | src/middlewares/auth.middleware.ts |
| FDD-INT-06 | docs/FDD.md | Decisão de Integração | Molde do worker a partir do server | CODIGO | src/server.ts |
| FDD-INT-07 | docs/FDD.md | Decisão de Integração | Novos models com uuid | CODIGO | prisma/schema.prisma |
| FDD-CONTRATO-01 | docs/FDD.md | Contrato | POST /webhooks retorna secret na criação | TRANSCRICAO | [09:31] Marcos |
| FDD-CONTRATO-02 | docs/FDD.md | Contrato | GET /webhooks/:id/deliveries | TRANSCRICAO | [09:34] Marcos |
| FDD-CONTRATO-03 | docs/FDD.md | Contrato | POST /admin/webhooks/dead-letter/:id/replay | TRANSCRICAO | [09:35] Diego |
| FDD-CONTRATO-04 | docs/FDD.md | Contrato | POST /webhooks/:id/rotate-secret | TRANSCRICAO | [09:21] Sofia |
| FDD-CONTRATO-05 | docs/FDD.md | Contrato | Payload outbound e event_type order.status_changed | TRANSCRICAO | [09:43] Diego |
| FDD-CONTRATO-06 | docs/FDD.md | Contrato | Headers X-Event-Id/X-Signature/X-Timestamp/X-Webhook-Id | TRANSCRICAO | [09:44] Diego |
| FDD-ERRO-01 | docs/FDD.md | Código de erro | WEBHOOK_* seguindo padrão existente | TRANSCRICAO | [09:28] Bruno |
| FDD-ERRO-02 | docs/FDD.md | Código de erro | WEBHOOK_INVALID_URL (https obrigatório) | TRANSCRICAO | [09:23] Sofia |
| FDD-ERRO-03 | docs/FDD.md | Código de erro | WEBHOOK_PAYLOAD_TOO_LARGE (64KB) | TRANSCRICAO | [09:23] Sofia |
| FDD-RES-01 | docs/FDD.md | Resiliência | Timeout de 10s por tentativa | TRANSCRICAO | [09:42] Diego |
| FDD-RES-02 | docs/FDD.md | Resiliência | 5 tentativas, backoff 1m/5m/30m/2h/12h | TRANSCRICAO | [09:17] Diego |
| FDD-RES-03 | docs/FDD.md | Resiliência | Sem rollback da mudança de status por falha de entrega | TRANSCRICAO | [09:06] Diego |
| FDD-OBS-01 | docs/FDD.md | Observabilidade | Logs Pino com redact de secret/signature | CODIGO | src/shared/logger/index.ts |
| ADR-001 | docs/adrs/ADR-001-outbox-no-mysql.md | Decisão | Outbox transacional no MySQL | TRANSCRICAO | [09:06] Diego |
| ADR-002 | docs/adrs/ADR-002-retry-backoff-e-dlq.md | Decisão | Retry backoff + DLQ separada | TRANSCRICAO | [09:17] Diego |
| ADR-003 | docs/adrs/ADR-003-hmac-sha256-secret-por-endpoint.md | Decisão | HMAC-SHA256, secret por endpoint, grace 24h | TRANSCRICAO | [09:22] Sofia |
| ADR-004 | docs/adrs/ADR-004-at-least-once-x-event-id.md | Decisão | at-least-once com X-Event-Id | TRANSCRICAO | [09:26] Larissa |
| ADR-005 | docs/adrs/ADR-005-worker-separado-polling.md | Decisão | Worker separado, polling 2s | TRANSCRICAO | [09:11] Larissa |
| ADR-006 | docs/adrs/ADR-006-reuso-padroes-do-projeto.md | Decisão | Reuso dos padrões do projeto | CODIGO | src/shared/errors/app-error.ts |
| ADR-007 | docs/adrs/ADR-007-snapshot-do-payload-na-outbox.md | Decisão | Snapshot do payload na inserção | TRANSCRICAO | [09:52] Larissa |
| DEC-UUID | docs/FDD.md | Decisão secundária | uuid como id das novas tabelas | TRANSCRICAO | [09:51] Larissa |
| DEC-PUB | docs/FDD.md | Decisão secundária | publishWebhookEvent(tx, ...) função pura | TRANSCRICAO | [09:41] Bruno |

## Relatório de cobertura

- Total de linhas: 57
- Linhas com `Fonte = TRANSCRICAO`: 47 de 57 (82%), meta >= 70% atingida.
- Linhas com `Fonte = CODIGO`: 10 (`src/shared/logger/index.ts` x2, `src/modules/orders/order.service.ts`, `src/modules/orders/order.status.ts`, `src/shared/errors/http-errors.ts`, `src/middlewares/error.middleware.ts`, `src/middlewares/auth.middleware.ts`, `src/server.ts`, `prisma/schema.prisma`, `src/shared/errors/app-error.ts`), meta >= 5 atingida.
- Linhas marcadas para revisão por falta de origem: 0.
- Itens sem origem: nenhum. Todos os itens dos documentos têm origem identificável na transcrição ou no código.
