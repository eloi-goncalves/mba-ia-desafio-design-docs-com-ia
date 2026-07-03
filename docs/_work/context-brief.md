# Context Brief — Sistema de Webhooks de Notificação de Pedidos

> Artefato de onboarding. Mapeia o código existente e a transcrição da reunião técnica para alimentar os prompts seguintes (ADRs, RFC, FDD, PRD, Tracker). Nenhum design doc é escrito aqui e nenhum arquivo de código foi alterado.

---

## 1. Stack e estrutura

Order Management System (OMS) em **Node.js + TypeScript (ESM)**, HTTP via **Express**, persistência em **MySQL** através do **Prisma ORM**. Validação de entrada com **Zod**, logging estruturado com **Pino**, autenticação via **JWT** (`jsonwebtoken`). Testes com **Vitest**.

Estrutura relevante (verificada no repositório):

```
src/
  app.ts                     # buildApp + composição das dependências (DI manual)
  server.ts                  # entry-point HTTP (bootstrap + graceful shutdown)
  config/                    # env, database (PrismaClient)
  middlewares/               # auth, error, request-logger, validate
  modules/                   # um módulo por domínio (auth, users, customers, products, orders)
    <dominio>/
      <dominio>.controller.ts
      <dominio>.service.ts
      <dominio>.repository.ts
      <dominio>.routes.ts
      <dominio>.schemas.ts    # schemas Zod + tipos inferidos
  shared/
    errors/                  # AppError + erros HTTP + índice
    logger/                  # Pino + redact
    http/                    # helpers de resposta (paginated)
  routes/index.ts            # monta o router /api/v1
prisma/
  schema.prisma              # enums, modelos, padrão uuid
```

Cada domínio segue o mesmo padrão modular (controller → service → repository → routes → schemas). A feature de webhooks vai criar `src/modules/webhooks/` seguindo esse mesmo formato, mais um novo entry-point `src/worker.ts` como processo separado (decidido em `[09:11] Larissa` e `[09:28] Bruno`).

---

## 2. Inventário de arquivos-âncora

| Arquivo | Papel | Símbolos-chave | Por que importa para webhooks |
| --- | --- | --- | --- |
| `src/modules/orders/order.service.ts` | Regra de negócio de pedidos; muda status transacionalmente | `changeStatus`, `this.prisma.$transaction`, `tx.order.update`, `tx.orderStatusHistory.create` | Ponto de integração crítico: a inserção na `webhook_outbox` precisa acontecer dentro da mesma transação (`[09:40] Bruno`, `[09:41] Diego`) |
| `src/modules/orders/order.status.ts` | Máquina de estados do pedido | `transitions`, `canTransition`, `allowedTransitions`, `isTerminal`, `shouldDebitStock`, `shouldReplenishStock` | Define quais mudanças de status existem e portanto quais eventos podem ser emitidos (`SHIPPED → DELIVERED` etc.) |
| `src/shared/errors/app-error.ts` | Classe base de erro de aplicação | `AppError` (`statusCode`, `errorCode`, `details`) | Base para os novos erros `WEBHOOK_*` (`[09:28] Bruno`) |
| `src/shared/errors/http-errors.ts` | Erros HTTP concretos e padrão de `errorCode` | `ValidationError`, `NotFoundError`, `ConflictError`, `UnprocessableEntityError`, `InvalidStatusTransitionError`, `InsufficientStockError` | Modelo a copiar para `WEBHOOK_NOT_FOUND`, `WEBHOOK_INVALID_URL`, `WEBHOOK_SECRET_REQUIRED` etc. (`[09:28] Bruno`) |
| `src/middlewares/error.middleware.ts` | Error middleware centralizado | `errorMiddleware`, tratamento de `AppError`/`ZodError`/`Prisma.PrismaClientKnownRequestError` | Já converte `AppError` em JSON `{ error: { code, message, details } }`; pega os novos erros sem alteração (`[09:29] Bruno`) |
| `src/middlewares/auth.middleware.ts` | Autenticação e autorização | `authenticate`, `requireRole`, `AuthUser` (`role: 'ADMIN' \| 'OPERATOR'`) | CRUD de webhook usa `authenticate`; replay da DLQ exige `requireRole('ADMIN')` (`[09:36] Larissa`) |
| `src/shared/logger/index.ts` | Logger estruturado | `logger`, `createLogger`, `redactPaths` | Logging do worker e das entregas; `redact` protege secrets/tokens em log (`[09:29] Bruno`, reforço de segurança da Sofia) |
| `src/server.ts` | Entry-point HTTP | `bootstrap`, `app.listen`, `shutdown` (SIGINT/SIGTERM) | Molde para o novo `src/worker.ts`, processo separado com mesmo Prisma/DATABASE_URL (`[09:11] Larissa`, `[09:30] Bruno`) |
| `src/app.ts` | Composição da app e DI manual | `buildApp`, `buildControllers` | Onde o `webhooks` controller/rotas serão registrados no `/api/v1` |
| `prisma/schema.prisma` | Schema do banco | `enum OrderStatus`, `model Order`, `model OrderStatusHistory`, `@default(uuid())` | Novas tabelas (`webhook_outbox`, `webhook_dead_letter`, config de webhook) seguem o padrão `uuid` (`[09:51] Larissa`) |
| `src/modules/products/` | Módulo de exemplo completo | `product.controller/service/repository/routes/schemas.ts` | Referência do padrão modular + schemas Zod a replicar em `webhooks` |

---

## 3. Máquina de estados atual

Extraído literalmente do mapa `transitions` em `src/modules/orders/order.status.ts`:

- `PENDING → [PAID, CANCELLED]`
- `PAID → [PROCESSING, CANCELLED]`
- `PROCESSING → [SHIPPED, CANCELLED]`
- **`SHIPPED → [DELIVERED]`** ← relevante para a Fase 2 (única transição de saída de `SHIPPED`)
- `DELIVERED → []` (terminal)
- `CANCELLED → []` (terminal)

Regras de estoque associadas no mesmo arquivo:
- `shouldDebitStock`: debita estoque apenas em `PENDING → PAID`.
- `shouldReplenishStock`: repõe estoque quando `to === CANCELLED` e `from` for `PAID` ou `PROCESSING`.

Cada transição válida representa um evento potencial `order.status_changed` que pode alimentar a outbox. O filtro por status desejado por endpoint (decidido em `[09:33] Marcos` e `[09:34] Bruno`) decide quais dessas transições geram linha na `webhook_outbox`.

---

## 4. Ponto de integração crítico (`changeStatus`)

O método `changeStatus` vive em `src/modules/orders/order.service.ts` (declaração em [`order.service.ts` L126](../../src/modules/orders/order.service.ts#L126)) e executa toda a mudança de status dentro de um único `this.prisma.$transaction(async (tx) => { ... })` aberto em [L131](../../src/modules/orders/order.service.ts#L131).

Dentro dessa transação, na ordem atual:

1. `tx.order.findUnique` carrega a order + items;
2. valida `from === to`, `canTransition`, e ajusta estoque (`debitStock`/`replenishStock`);
3. [L158](../../src/modules/orders/order.service.ts#L158) `await tx.order.update(...)` grava o novo `status`;
4. [L159](../../src/modules/orders/order.service.ts#L159) `await tx.orderStatusHistory.create(...)` registra a auditoria da transição;
5. [L169](../../src/modules/orders/order.service.ts#L169) `const refreshed = await tx.order.findUnique(...)` relê o estado final e retorna.

**Onde a outbox entra:** a inserção na `webhook_outbox` deve acontecer entre o passo 4 (criação do `orderStatusHistory`, fim em L167) e o passo 5 (`refreshed`), ainda dentro do mesmo `tx`. A reunião propôs uma função pura `publishWebhookEvent(tx, order, fromStatus, toStatus)` que recebe o `tx` client atual, evitando injetar um repository inteiro no `OrderService` (`[09:41] Bruno`, `[09:41] Diego`). O snapshot do payload é renderizado na inserção (`[09:52] Larissa` e `[09:52] Diego`).

**Se ficar fora da transação:** perde-se a garantia atômica. Cenários de inconsistência:
- Se o `commit` do status ocorrer mas a inserção do evento falhar (processo cai, erro de rede/DB depois do commit), o status muda e o cliente nunca é notificado.
- Se a transação principal der `rollback` mas o evento já tiver sido enfileirado fora dela, envia-se um webhook de uma mudança que não aconteceu.

O padrão outbox transacional elimina os dois casos: se a transação commitou, o evento está registrado; se deu rollback, o evento some junto (`[09:06] Diego`, reforço em `[09:41] Diego`).

---

## 5. Padrões reaproveitáveis

| Padrão | Onde vive (arquivo) | Como será reaproveitado pela feature de webhooks |
| --- | --- | --- |
| `AppError` / códigos de erro | `src/shared/errors/app-error.ts`, `src/shared/errors/http-errors.ts` | Novas classes de erro com `errorCode` no padrão `WEBHOOK_*` (ex.: `WEBHOOK_NOT_FOUND`, `WEBHOOK_INVALID_URL`, `WEBHOOK_SECRET_REQUIRED`), estendendo `AppError`/`NotFoundError`/`ValidationError` (`[09:28] Bruno`, `[09:29] Larissa`) |
| Error middleware centralizado | `src/middlewares/error.middleware.ts` | Nenhuma alteração: já serializa qualquer `AppError` em `{ error: { code, message, details } }` e trata `ZodError`/erros Prisma (`[09:29] Bruno`) |
| `requireRole` (autorização) | `src/middlewares/auth.middleware.ts` | Endpoint de replay da DLQ protegido com `requireRole('ADMIN')`; CRUD de config usa `authenticate` normal (`[09:36] Larissa`, `[09:36] Sofia`) |
| Logger Pino + redact | `src/shared/logger/index.ts` | Logs do worker, entregas e replays; `redactPaths` evita vazar `authorization`/`token`/secret em log (`[09:29] Bruno`) |
| Padrão de módulo | `src/modules/products/` (controller/service/repository/routes/schemas) | `src/modules/webhooks/` replica a mesma estrutura; worker em `src/modules/webhooks/webhook.worker.ts` ou `webhook.processor.ts` (`[09:27] Bruno`, `[09:28] Bruno`) |
| Schemas Zod | `src/modules/products/product.schemas.ts` (e `validate.middleware`) | Validação de body/params/query dos endpoints de webhook, incluindo URL `https` obrigatória e limite de payload (`[09:23] Sofia`, `[09:24] Larissa`) |
| `uuid` como identificador | `prisma/schema.prisma` (`@id @default(uuid()) @db.Char(36)`) | `id` das novas tabelas e o `X-Event-Id` gerado na inserção do evento (`[09:25] Diego`, `[09:51] Larissa`) |
| Entry-point / bootstrap | `src/server.ts`, `src/app.ts` | Molde para `src/worker.ts` (processo separado, mesmo PrismaClient por processo, graceful shutdown) (`[09:11] Larissa`, `[09:30] Bruno`) |

---

## 6. Glossário da feature

- **Outbox**: tabela (`webhook_outbox`) na qual, dentro da mesma transação SQL que atualiza `orders` e `order_status_history`, grava-se o evento; um worker separado lê e dispara os HTTP calls, garantindo consistência com o commit/rollback da transação principal (`[09:06] Diego`).
- **DLQ (Dead Letter Queue)**: tabela separada `webhook_dead_letter` com payload, motivo da falha e timestamp, para onde o evento é movido após esgotar as tentativas; serve de evidência para debug e reprocessamento manual (`[09:15] Diego`, `[09:18] Diego`).
- **HMAC-SHA256**: assinatura do corpo do request com uma secret compartilhada por endpoint, enviada no header `X-Signature`, para o cliente validar origem e integridade do payload (`[09:20] Sofia`).
- **At-least-once**: garantia de entrega em que o cliente pode receber o mesmo evento mais de uma vez e precisa estar preparado para deduplicar; escolhida por ser mais simples que exactly-once (`[09:24] Diego`, `[09:25] Diego`).
- **`X-Event-Id`**: header com o UUID único gerado quando o evento entra na outbox, usado pelo cliente para deduplicar entregas repetidas (`[09:25] Diego`).
- **Backoff exponencial**: política de retry com intervalos crescentes entre tentativas (1m, 5m, 30m, 2h, 12h), até 5 tentativas antes de mover para a DLQ (`[09:15] Diego`, `[09:17] Diego`).
- **Worker em polling**: processo separado que, a cada 2 segundos, busca em batch os eventos pendentes mais antigos da outbox, processa e marca o resultado; latência de até 2s no pior caso, dentro do requisito de "abaixo de 10 segundos" (`[09:09] Diego`, `[09:10] Larissa`).

---

## Autoverificação

- [x] Todos os caminhos de arquivo citados existem no repositório (`order.service.ts`, `order.status.ts`, `app-error.ts`, `http-errors.ts`, `error.middleware.ts`, `auth.middleware.ts`, `logger/index.ts`, `server.ts`, `app.ts`, `schema.prisma`, `modules/products/*`) — confirmado via leitura direta.
- [x] Nenhuma afirmação sobre a reunião está sem `[hh:mm] Nome`.
- [x] As transições da seção 3 batem 1:1 com o mapa `transitions` de `order.status.ts`.
- [x] Arquivo salvo em `docs/_work/context-brief.md`.

---

### Resumo (5 linhas)

1. OMS em Node.js/TS + Express + Prisma/MySQL, com padrão modular (controller/service/repository/routes/schemas) por domínio.
2. `OrderService.changeStatus` faz toda a mudança de status num único `this.prisma.$transaction`; a inserção na `webhook_outbox` deve entrar após `orderStatusHistory.create` e antes do `refreshed`, ainda dentro do `tx`.
3. Máquina de estados atual tem 4 transições ativas, com destaque para `SHIPPED → [DELIVERED]` (relevante à Fase 2) e `DELIVERED`/`CANCELLED` terminais.
4. A feature reaproveita `AppError`/códigos `WEBHOOK_*`, error middleware, `requireRole('ADMIN')`, logger Pino, schemas Zod, padrão `uuid` e o molde de entry-point para o novo `src/worker.ts`.
5. Glossário (outbox, DLQ, HMAC-SHA256, at-least-once, `X-Event-Id`, backoff exponencial, worker em polling) ancorado nos timestamps da transcrição.
