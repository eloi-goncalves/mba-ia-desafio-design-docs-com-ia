# RFC: Sistema de Webhooks de Notificação de Pedidos

| Campo | Valor |
| --- | --- |
| Autor | Eloi Gonçalves (papel: Larissa, Tech Lead) |
| Status | Em revisão |
| Data | 2026-07-03 |
| Revisores | Marcos (PM), Bruno (Eng.), Diego (Eng. Sênior), Sofia (Segurança) |

## TL;DR

Proponho notificar clientes B2B sobre mudanças de status de pedidos via webhooks outbound, usando um padrão outbox transacional no MySQL existente, consumido por um worker em processo separado que faz polling a cada 2 segundos. As entregas são assinadas com HMAC-SHA256 (secret por endpoint), reentregues com backoff exponencial (5 tentativas) e movidas para uma DLQ ao esgotar. A garantia é at-least-once, com `X-Event-Id` para deduplicação no cliente. A solução reaproveita ao máximo os padrões já existentes do OMS.

## Contexto e problema

Três clientes B2B (Atlas Comercial, MaxDistribuição e Nova Cargo) pediram formalmente para serem notificados em tempo real quando o status de seus pedidos muda. Hoje eles fazem polling no `GET /orders` de tempos em tempos, o que torna a integração lenta e cara para eles (`[09:00] Marcos`). Para esses clientes, "tempo real" é qualquer coisa abaixo de 10 segundos (`[09:02] Marcos`). A Atlas sinalizou que pode migrar para o concorrente se a feature não sair até o fim do trimestre, o que cria risco de churn (`[09:00] Marcos`). O escopo é exclusivamente outbound (da plataforma para o cliente); webhooks inbound estão fora (`[09:02] Sofia`, `[09:02] Marcos`).

## Proposta técnica (visão geral)

**Outbox transacional no MySQL.** Na mesma transação que atualiza `orders` e `order_status_history`, inserimos o evento em `webhook_outbox`, garantindo consistência com o commit/rollback da mudança de status. Ver [ADR-001](adrs/ADR-001-outbox-no-mysql.md).

**Worker em processo separado com polling de 2s.** Um entry-point `src/worker.ts` (`npm run worker`), com PrismaClient próprio, lê os pendentes mais antigos em batch e dispara as entregas. A latência mínima de ~2s cabe no requisito de "abaixo de 10s". Ver [ADR-005](adrs/ADR-005-worker-separado-polling.md).

**Retry com backoff e DLQ.** Falhas são reentregues em 1m/5m/30m/2h/12h (5 tentativas); ao esgotar, o evento vai para `webhook_dead_letter`, com replay manual via endpoint admin. Ver [ADR-002](adrs/ADR-002-retry-backoff-e-dlq.md).

**Assinatura HMAC-SHA256 com secret por endpoint.** Cada endpoint tem secret única, rotacionável com grace period de 24h; a assinatura viaja em `X-Signature`. Ver [ADR-003](adrs/ADR-003-hmac-sha256-secret-por-endpoint.md).

**Garantia at-least-once com `X-Event-Id`.** O cliente pode receber o mesmo evento mais de uma vez e deduplica pelo `X-Event-Id`. Ver [ADR-004](adrs/ADR-004-at-least-once-x-event-id.md).

**Reuso dos padrões do projeto.** Módulo em `src/modules/webhooks/`, erros com prefixo `WEBHOOK_` estendendo `AppError`, error middleware, logger Pino e `requireRole` reaproveitados. Ver [ADR-006](adrs/ADR-006-reuso-padroes-do-projeto.md). O payload é um snapshot renderizado na inserção. Ver [ADR-007](adrs/ADR-007-snapshot-do-payload-na-outbox.md).

## Alternativas consideradas

### Alternativa 1: disparo síncrono no `changeStatus`
- Trade-off que motivou o descarte: um HTTP call dentro da transação travaria a mudança de status de outros pedidos quando o cliente estivesse lento ou offline, e falha do cliente forçaria decisões ruins sobre rollback (`[09:04] Bruno`, `[09:06] Diego`). Ver [ADR-001](adrs/ADR-001-outbox-no-mysql.md).

### Alternativa 2: Redis Streams / fila externa
- Trade-off que motivou o descarte: exigiria subir infraestrutura nova (ex.: Redis Cluster) para um time pequeno; overengineering quando o MySQL existente resolve (`[09:07] Diego`). Ver [ADR-001](adrs/ADR-001-outbox-no-mysql.md).

### Alternativa 3: exactly-once / trigger de banco para reatividade
- Trade-off que motivou o descarte: exactly-once exigiria coordenação dos dois lados, muito mais complexo que at-least-once com `event_id` (`[09:25] Diego`); e o MySQL não tem listener nativo (NOTIFY/LISTEN), então trigger não notifica processo externo, tornando o polling de 2s a opção pragmática (`[09:09] Diego`).

## Questões em aberto

- **Rate limiting de saída:** se um cliente tem muitos pedidos mudando de status em pouco tempo, podemos bombardeá-lo com muitas chamadas. Decisão adiada: observar e implementar se virar problema (`[09:38] Diego`, `[09:39] Larissa`).
- **Ordering global ao escalar para múltiplos workers:** enquanto for single-worker, a ordem por `order_id` é implícita via `created_at`; ao paralelizar, perdemos essa garantia. Futuro via particionamento por `order_id` ou lock pessimista (`[09:12] Diego`, `[09:13] Diego`).
- **Notificação ao cliente sobre webhook com problema (email):** adiada para a próxima fase, após medir o impacto (`[09:37] Larissa`, `[09:38] Marcos`).
- **Endurecimento de roles no CRUD de configuração:** por enquanto qualquer role autenticada; pode ser endurecido mais adiante (`[09:37] Sofia`).

## Impacto e riscos

**Impacto no sistema existente.** A alteração crítica é dentro de `changeStatus` (`src/modules/orders/order.service.ts`), que passa a inserir na `webhook_outbox` dentro da mesma transação; se a inserção falhar, a transação inteira dá rollback (`[09:40] Bruno`, `[09:41] Diego`). Surge um novo processo (`src/worker.ts`) e novas tabelas no schema Prisma.

**Riscos principais e mitigação em alto nível.**
- Acúmulo de linhas na outbox degradando o worker: mitigado por índices em estado e `created_at` e leitura em batch pequeno (`[09:08] Diego`); arquivamento futuro de linhas entregues.
- Vazamento de secret do cliente: mitigado por secret por endpoint e rotação com grace de 24h (`[09:21] Sofia`), além de `redact` no logger.
- Regressão na transação de status: mitigado por testes ponta a ponta e revisão de segurança da Sofia antes do deploy (`[09:46] Sofia`).

## Decisões relacionadas (ADRs)

- [ADR-001: Padrão Outbox transacional no MySQL](adrs/ADR-001-outbox-no-mysql.md)
- [ADR-002: Retry com backoff exponencial e DLQ](adrs/ADR-002-retry-backoff-e-dlq.md)
- [ADR-003: HMAC-SHA256 com secret por endpoint](adrs/ADR-003-hmac-sha256-secret-por-endpoint.md)
- [ADR-004: Garantia at-least-once com X-Event-Id](adrs/ADR-004-at-least-once-x-event-id.md)
- [ADR-005: Worker em processo separado com polling](adrs/ADR-005-worker-separado-polling.md)
- [ADR-006: Reuso dos padrões existentes do projeto](adrs/ADR-006-reuso-padroes-do-projeto.md)
- [ADR-007: Snapshot do payload na outbox](adrs/ADR-007-snapshot-do-payload-na-outbox.md)
