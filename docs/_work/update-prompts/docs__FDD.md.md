Voce esta atualizando UM design doc para refletir uma mudanca de codigo.
NAO reescreva o documento inteiro. Altere apenas os trechos impactados.

Documento: docs/FDD.md
Itens do Tracker afetados: FDD-INT-02
Trecho atual do documento:
---
### 4.1 Criação do evento na outbox (dentro da transação de changeStatus)
1. `changeStatus` abre `this.prisma.$transaction(async (tx) => { ... })` em `src/modules/orders/order.service.ts`.
2. Valida transição via `canTransition` (`src/modules/orders/order.status.ts`), atualiza estoque quando aplicável.
3. `tx.order.update(...)` grava o novo `status`.
4. `tx.orderStatusHistory.create(...)` registra a auditoria da transição.
...
| --- | --- |
| `src/modules/orders/order.service.ts` | Estender `changeStatus` para chamar `publishWebhookEvent(tx, order, fromStatus, toStatus)` dentro do `this.prisma.$transaction`, após `tx.orderStatusHistory.create` e antes do `refreshed`; se a inserção na outbox falhar, rollback (`[09:40] Bruno`, `[09:41] Diego`) |
| `src/modules/orders/order.status.ts` | Fonte da verdade das transições (`transitions`, `canTransition`); define quais mudanças de status disparam eventos (ex.: `SHIPPED → DELIVERED`) e alimenta o filtro por endpoint |
| `src/shared/errors/http-errors.ts` e `src/shared/errors/app-error.ts` | Criar `WebhookNotFoundError`, `WebhookInvalidUrlError` etc. estendendo `AppError`/`NotFoundError`/`ValidationError`, seguindo o padrão de `InvalidStatusTransitionError` e `InsufficientStockError`, com códigos `WEBHOOK_*` |
| `src/middlewares/error.middleware.ts` | Sem alteração: já converte `AppError`/`ZodError`/erros Prisma em `{ error: { code, message, details } }`; os erros `WEBHOOK_*` fluem direto (`[09:29] Bruno`) |
...
Confirmação de existência dos arquivos citados na seção 12 (todos verificados no repositório):
- `src/modules/orders/order.service.ts`: existe.
- `src/modules/orders/order.status.ts`: existe.
- `src/shared/errors/http-errors.ts`: existe.
- `src/shared/errors/app-error.ts`: existe.
---
Diff do codigo (src/modules/orders/order.status.ts):
---
diff --git a/src/modules/orders/order.status.ts b/src/modules/orders/order.status.ts
index 79f5c99..951ade3 100644
--- a/src/modules/orders/order.status.ts
+++ b/src/modules/orders/order.status.ts
@@ -4,7 +4,7 @@ const transitions: Readonly<Record<OrderStatus, ReadonlyArray<OrderStatus>>> = {
   [OrderStatus.PENDING]: [OrderStatus.PAID, OrderStatus.CANCELLED],
   [OrderStatus.PAID]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
   [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
-  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
+  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
   [OrderStatus.DELIVERED]: [],
   [OrderStatus.CANCELLED]: [],
 };

---
Regra: mantenha o estilo e a rastreabilidade. Produza apenas o trecho atualizado.
