# ADR-006: Reuso dos padrões existentes do projeto

- **Status:** Aceito
- **Data:** 2026-07-03
- **Decisores:** Larissa (Tech Lead), Diego (Eng. Sênior), Bruno (Eng.), Sofia (Segurança), Marcos (PM)
- **Origem:** reunião técnica de Webhooks, ver `TRANSCRICAO.md`

## Contexto

O OMS já tem convenções maduras e consistentes: módulos por domínio, classe base de erro, error middleware centralizado, logger estruturado e validação com Zod. Introduzir stacks ou padrões novos para a feature de webhooks aumentaria a superfície de manutenção sem benefício, já que o Pino e o error middleware existentes já tratam `AppError`, Zod e Prisma sem alteração (`[09:29] Bruno`, `[09:30] Larissa`).

## Decisão

A feature reaproveita ao máximo o que já existe (`[09:30] Larissa`):

- **Módulo por domínio:** criar `src/modules/webhooks/` com `controller`, `service`, `repository`, `routes` e `schemas`, no mesmo padrão de `src/modules/products/` (`[09:27] Bruno`). A lógica de processamento fica em `src/modules/webhooks/webhook.worker.ts` ou `webhook.processor.ts`, acionada pelo entry-point `src/worker.ts` (`[09:28] Bruno`).
- **Erros:** novas classes estendem `AppError` de `src/shared/errors/app-error.ts`, seguindo o padrão de `InvalidStatusTransitionError` e `InsufficientStockError` em `src/shared/errors/http-errors.ts`. Todos os códigos usam o prefixo `WEBHOOK_` (ex.: `WEBHOOK_NOT_FOUND`, `WEBHOOK_INVALID_URL`, `WEBHOOK_SECRET_REQUIRED`), assim como os existentes `INSUFFICIENT_STOCK` e `INVALID_STATUS_TRANSITION` (`[09:28] Bruno`, `[09:29] Larissa`).
- **Error middleware:** `src/middlewares/error.middleware.ts` já serializa qualquer `AppError` em `{ error: { code, message, details } }` e trata `ZodError`/erros Prisma; os novos erros fluem sem alteração (`[09:29] Bruno`).
- **Autorização:** reusar `requireRole('ADMIN')` de `src/middlewares/auth.middleware.ts` no endpoint de replay da DLQ; o CRUD de configuração usa `authenticate` normal (`[09:36] Larissa`).
- **Logging:** reusar o logger Pino de `src/shared/logger/index.ts`, com `redactPaths` para não vazar secret/token em log (`[09:29] Bruno`).
- **Identificadores:** `uuid` como id das novas tabelas, seguindo `prisma/schema.prisma` (`@default(uuid())`) (`[09:51] Larissa`).
- **Entry-point:** `src/worker.ts` modelado em `src/server.ts`, com PrismaClient próprio por processo (`[09:30] Bruno`).

## Alternativas consideradas

### Introduzir stack/logger novos para a feature
- Descrição: adotar uma nova biblioteca de logging ou um novo padrão de erros só para webhooks.
- Por que foi descartada (trade-off): desnecessário; o Pino e o error middleware já tratam `AppError`/Zod/Prisma sem mudança, e um padrão paralelo aumentaria a complexidade de manutenção (`[09:29] Bruno`).

## Consequências

**Positivas**
- Curva de aprendizado mínima; o módulo de webhooks fica igual aos demais (`[09:30] Larissa`).
- Zero alteração no error middleware para suportar os novos códigos (`[09:29] Bruno`).

**Negativas / trade-offs aceitos**
- A feature fica acoplada às convenções atuais; mudanças globais de padrão impactam também o módulo de webhooks (aceito).

## Relacionados
- [ADR-003: Assinatura HMAC-SHA256 com secret por endpoint](ADR-003-hmac-sha256-secret-por-endpoint.md)
- [ADR-005: Worker em processo separado com polling](ADR-005-worker-separado-polling.md)
