# ADR-001: Padrão Outbox transacional no MySQL

- **Status:** Aceito
- **Data:** 2026-07-03
- **Decisores:** Larissa (Tech Lead), Diego (Eng. Sênior), Bruno (Eng.), Sofia (Segurança), Marcos (PM)
- **Origem:** reunião técnica de Webhooks, ver `TRANSCRICAO.md`

## Contexto

A feature precisa notificar clientes B2B quando o status de um pedido muda, sem comprometer a consistência do OMS. O ponto de disparo natural é o `changeStatus`, que já roda dentro de uma transação pesada (atualiza `orders`, insere em `order_status_history` e ajusta estoque). Fazer o disparo do webhook de forma síncrona nessa transação foi rejeitado: um HTTP call no meio da transação trava a mudança de status de outros pedidos quando o cliente está lento ou offline (`[09:04] Bruno`), e não há resposta boa para "e se o cliente estiver fora do ar, dá rollback na mudança de status?" (`[09:04] Bruno`).

A necessidade é uma garantia atômica: se a transação de status commitou, o evento existe; se deu rollback, o evento some junto (`[09:06] Diego`).

## Decisão

Adotar o padrão **Outbox transacional no MySQL existente**. Na mesma transação SQL que atualiza `orders` e `order_status_history`, insere-se uma linha na tabela `webhook_outbox` com o evento. Um worker separado lê essa tabela e dispara as chamadas HTTP (`[09:06] Diego`, `[09:08] Larissa`). A tabela tem índice no campo de estado (pendente/processando/falhou/entregue) e em `created_at`; o worker lê apenas os pendentes em batch pequeno, processa e marca o resultado (`[09:08] Diego`).

## Alternativas consideradas

### Disparo síncrono no service de orders
- Descrição: emitir o HTTP call diretamente dentro do `changeStatus`.
- Por que foi descartada (trade-off): um cliente lento ou offline travaria a mudança de status de outros pedidos, e falha do cliente forçaria decisões ruins sobre rollback da mudança de status (`[09:04] Bruno`, `[09:06] Diego`).

### Redis Streams / fila externa
- Descrição: publicar o evento em uma fila externa dedicada (ex.: Redis Streams).
- Por que foi descartada (trade-off): exigiria subir mais infraestrutura (ex.: Redis Cluster) para um time pequeno; overengineering quando o MySQL existente já resolve (`[09:07] Diego`).

## Consequências

**Positivas**
- Consistência garantida com o commit/rollback da transação principal (`[09:06] Diego`).
- Nenhuma infraestrutura nova; reaproveita o MySQL e o Prisma já existentes (`[09:07] Diego`).
- Leitura eficiente via índice em estado e `created_at` (`[09:08] Diego`).

**Negativas / trade-offs aceitos**
- Introduz uma tabela e um processo de leitura por polling (latência mínima de ~2s, ver ADR-005).
- Linhas entregues acumulam e precisarão de arquivamento futuro (~30 dias), fora do escopo desta feature (`[09:08] Diego`).

## Relacionados
- [ADR-005: Worker em processo separado com polling](ADR-005-worker-separado-polling.md)
- [ADR-007: Snapshot do payload na outbox](ADR-007-snapshot-do-payload-na-outbox.md)
