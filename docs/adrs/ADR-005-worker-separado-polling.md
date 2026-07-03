# ADR-005: Worker em processo separado com polling de 2 segundos

- **Status:** Aceito
- **Data:** 2026-07-03
- **Decisores:** Larissa (Tech Lead), Diego (Eng. Sênior), Bruno (Eng.), Sofia (Segurança), Marcos (PM)
- **Origem:** reunião técnica de Webhooks, ver `TRANSCRICAO.md`

## Contexto

Com o padrão outbox definido (ver ADR-001), é preciso decidir como e onde os eventos pendentes são lidos e disparados. O requisito de latência é "abaixo de 10 segundos" para os clientes (`[09:02] Marcos`, `[09:10] Larissa`). A leitura reativa por trigger de banco não é viável no MySQL, e acoplar o worker ao processo da API é frágil (`[09:09] Diego`, `[09:11] Diego`).

## Decisão

O consumo da outbox roda em um **processo separado**, com entry-point próprio `src/worker.ts` e script `npm run worker`, seguindo o molde de `src/server.ts` (`[09:11] Larissa`). O worker usa **polling em loop a cada 2 segundos**, buscando os eventos pendentes mais antigos em batch, processando e marcando o resultado (`[09:09] Diego`). O worker conecta no mesmo banco (mesma `DATABASE_URL`), mas abre um **PrismaClient próprio**, porque `PrismaClient` é por processo (`[09:11] Bruno`, `[09:30] Bruno`). Enquanto for single-worker, a ordenação por `order_id` é implícita via `created_at`; não há garantia de ordering global (`[09:12] Diego`, `[09:13] Larissa`).

## Alternativas consideradas

### Disparo síncrono no service
- Descrição: processar o envio dentro do `changeStatus`.
- Por que foi descartada (trade-off): trava a mudança de status de outros pedidos; fora de questão (`[09:06] Diego`).

### Trigger de banco (reatividade)
- Descrição: usar trigger no MySQL para acionar o worker.
- Por que foi descartada (trade-off): o MySQL não tem listener nativo (NOTIFY/LISTEN como o Postgres); a trigger só executa SQL, não notifica processo externo. Polling de 2s atende o requisito de "abaixo de 10s" (`[09:09] Diego`).

### Worker na mesma instância da API
- Descrição: rodar o loop dentro do processo da API.
- Por que foi descartada (trade-off): se a API reinicia, perde o worker (`[09:11] Diego`).

## Consequências

**Positivas**
- Isolamento de falhas: reinício da API não derruba o processamento de webhooks (`[09:11] Diego`).
- Latência de ~2s no pior caso, dentro do requisito de "abaixo de 10s" (`[09:10] Larissa`).

**Negativas / trade-offs aceitos**
- Sem ordering global; garantia apenas por `order_id` enquanto single-worker (`[09:13] Larissa`).
- Escalar para múltiplos workers exigirá particionamento por `order_id` ou lock pessimista no futuro (`[09:13] Diego`).

## Relacionados
- [ADR-001: Padrão Outbox transacional no MySQL](ADR-001-outbox-no-mysql.md)
- [ADR-002: Retry com backoff exponencial e DLQ](ADR-002-retry-backoff-e-dlq.md)
- [ADR-006: Reuso dos padrões existentes do projeto](ADR-006-reuso-padroes-do-projeto.md)
