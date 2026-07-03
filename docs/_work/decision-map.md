# Decision Map — Sistema de Webhooks de Notificação de Pedidos

> Destilação auditável da `TRANSCRICAO.md`. Separa o que **entra** (decidido) do que **NÃO entra** (adiado/descartado). Cada item tem origem `[hh:mm] Nome`. Este mapa é o esqueleto de PRD, RFC, FDD, ADRs e Tracker.

---

## 1. Decisões arquiteturais principais (candidatas a ADR)

| # | Decisão | Resumo | Alternativa descartada + trade-off | Origem `[hh:mm] Nome` |
| --- | --- | --- | --- | --- |
| 1 | Padrão Outbox no MySQL | Na mesma transação que atualiza `orders`/`order_status_history`, insere linha em `webhook_outbox`; worker separado lê e dispara. Garante consistência com commit/rollback | **Disparo síncrono no service**: HTTP no meio da transação trava mudança de status de outros pedidos se o cliente está lento/offline (`[09:04] Bruno`). **Redis Streams / fila externa**: exigiria subir mais infra (Redis Cluster) para um time pequeno, overengineering (`[09:07] Diego`) | `[09:06] Diego`, `[09:07] Diego`, `[09:08] Larissa` |
| 2 | Retry com backoff exponencial + DLQ em tabela separada | 5 tentativas com intervalos 1m/5m/30m/2h/12h (~15h no total); após esgotar, move para `webhook_dead_letter` (payload, motivo, timestamp) | **3 tentativas**: muito agressivo, mataria evento em ~30min e não cobre indisponibilidade de 2h de manutenção planejada (`[09:16] Diego`). **Retry indefinido**: deixa evento pendurado para sempre se o cliente sumiu (`[09:15] Diego`). **Marcar "failed" na própria outbox**: tabela separada mantém a outbox limpa e serve de evidência para debug/reprocessamento (`[09:18] Diego`) | `[09:15] Diego`, `[09:17] Diego`, `[09:17] Larissa`, `[09:18] Diego` |
| 3 | HMAC-SHA256, secret por endpoint, rotação com grace period 24h | Assina o corpo do request com secret compartilhada, envia em `X-Signature`; secret única por endpoint; rotação mantém a antiga válida por 24h em paralelo | **Secret global da plataforma**: se vaza uma, vaza tudo (`[09:21] Sofia`). Sem grace period, rotação quebraria a integração do cliente durante a migração (`[09:21] Sofia`) | `[09:20] Sofia`, `[09:21] Sofia`, `[09:22] Sofia` |
| 4 | Garantia at-least-once com `X-Event-Id` | UUID único por evento gerado na inserção da outbox, enviado no header `X-Event-Id`; cliente deduplica pelo id do lado dele | **Exactly-once**: exigiria coordenação dos dois lados, muito mais complexo; at-least-once com event_id resolve 99% dos casos (padrão de mercado: Stripe, GitHub) (`[09:25] Diego`). Trade-off: joga a responsabilidade de dedup para o cliente (`[09:25] Sofia`) | `[09:24] Diego`, `[09:25] Diego`, `[09:26] Larissa` |
| 5 | Worker em processo separado, polling de 2s | `src/worker.ts` como entry-point próprio (`npm run worker`), processo separado da API, mesmo banco/DATABASE_URL, PrismaClient próprio; loop a cada 2s lendo pendentes em batch | **Síncrono no service**: fora de questão, trava mudança de status (`[09:06] Diego`). **Trigger de banco**: MySQL não tem NOTIFY/LISTEN nativo; trigger só executa SQL, não notifica processo externo (`[09:09] Diego`). **Worker na mesma instância da API**: se a API reinicia, perde o worker (`[09:11] Diego`) | `[09:09] Diego`, `[09:10] Larissa`, `[09:11] Larissa`, `[09:11] Diego` |
| 6 | Reuso dos padrões existentes do projeto | Módulo `src/modules/webhooks` no padrão dos outros; reaproveita `AppError`, códigos `WEBHOOK_*`, error middleware, logger Pino, schemas Zod, `requireRole`, `uuid` | **Introduzir stack/logger novos**: desnecessário, o Pino e o error middleware já tratam `AppError`/Zod/Prisma sem mudança (`[09:29] Bruno`) | `[09:27] Bruno`, `[09:28] Bruno`, `[09:29] Bruno`, `[09:30] Larissa` |

---

## 2. Decisões secundárias (podem virar ADR extra ou só FDD)

| Decisão | Resumo | Origem `[hh:mm] Nome` |
| --- | --- | --- |
| Snapshot do payload na inserção | A outbox guarda o payload já renderizado, refletindo o estado de quando o status mudou, não `order_id` para renderizar depois | `[09:52] Larissa`, `[09:52] Diego`, `[09:52] Bruno` |
| `uuid` como id | Id das novas tabelas segue o padrão `uuid` do resto do projeto (não auto-incremento) | `[09:51] Larissa` |
| Timeout HTTP do worker de 10s | Cliente que não responde em 10s é tratado como falha e marcado para retry | `[09:42] Diego` |
| Formato do payload | JSON com `event_id`, `event_type` (`order.status_changed`), timestamp ISO 8601, `order_id`, `order_number`, `from_status`, `to_status`, `customer_id`, `total_cents`; sem `items` para não inflar | `[09:43] Diego` |
| Headers do envio | `X-Event-Id` (UUID), `X-Signature` (HMAC), `X-Timestamp` (envio, para detectar replay), `Content-Type: application/json`, `X-Webhook-Id` (id do endpoint) | `[09:44] Diego`, `[09:44] Sofia`, `[09:45] Diego` |
| Filtro de eventos na inserção | Se nenhum webhook do customer quer aquele status, nem insere na outbox; economiza linha | `[09:33] Marcos`, `[09:34] Bruno`, `[09:34] Diego` |
| Função `publishWebhookEvent(tx, ...)` | Função pura recebendo o `tx` da transação atual, em vez de injetar repository inteiro no `OrderService` | `[09:41] Bruno`, `[09:41] Diego` |
| Ordering single-worker | Ordering implícita por `order_id` via `created_at` enquanto for single-worker; não é garantia global | `[09:12] Diego`, `[09:13] Larissa` |
| Arquivamento da outbox | Linhas entregues arquivadas após ~30 dias; fora do escopo desta feature | `[09:08] Diego` |

---

## 3. Requisitos funcionais (para o PRD)

| ID | Requisito | Descrição de 1 linha | Prioridade | Origem `[hh:mm] Nome` |
| --- | --- | --- | --- | --- |
| RF-01 | Cadastrar webhook | `POST` autenticado com `url`, lista de status desejados, `customer_id` no body/path; secret gerada pela plataforma e devolvida na criação | Alta | `[09:31] Marcos`, `[09:32] Larissa` |
| RF-02 | Editar webhook | `PATCH` para alterar configuração do endpoint | Alta | `[09:33] Bruno` |
| RF-03 | Remover webhook | `DELETE` para remover o endpoint | Alta | `[09:33] Bruno` |
| RF-04 | Listar webhooks do customer | `GET` para listar os webhooks de um customer | Alta | `[09:33] Bruno` |
| RF-05 | Filtro de eventos por endpoint | Cada webhook escolhe quais status quer ouvir; filtro aplicado na inserção da outbox | Alta | `[09:33] Marcos`, `[09:34] Bruno` |
| RF-06 | Histórico de deliveries | `GET /webhooks/:id/deliveries` com últimas entregas: sucesso/falha, payload, response, tempo de resposta | Média | `[09:34] Marcos` |
| RF-07 | Replay de DLQ (admin) | `POST /admin/webhooks/dead-letter/:id/replay`, role ADMIN, recoloca na outbox como pendente e loga quem fez (auditoria) | Média | `[09:18] Diego`, `[09:35] Diego`, `[09:36] Sofia` |
| RF-08 | Geração e rotação de secret | Secret gerada pela plataforma; endpoint para o cliente pedir nova secret; antiga válida por 24h em paralelo | Alta | `[09:21] Sofia`, `[09:22] Sofia` |
| RF-09 | Emissão transacional do evento | Inserção na `webhook_outbox` dentro da mesma transação do `changeStatus`; se a outbox falhar, rollback | Alta | `[09:40] Bruno`, `[09:41] Diego` |
| RF-10 | Entrega assinada ao cliente | Worker envia HTTP POST com payload JSON assinado (HMAC-SHA256) e headers (`X-Event-Id`, `X-Signature`, `X-Timestamp`, `X-Webhook-Id`) | Alta | `[09:20] Sofia`, `[09:43] Diego`, `[09:44] Diego` |

---

## 4. Requisitos não funcionais

| ID | Requisito | Descrição | Classe | Origem `[hh:mm] Nome` |
| --- | --- | --- | --- | --- |
| RNF-01 | TLS obrigatório | URL do webhook deve ser `https`; `http` é recusado com erro de validação no schema Zod (não é decisão arquitetural) | RNF (não ADR) | `[09:23] Sofia` |
| RNF-02 | Limite de payload 64KB | Evento acima de 64KB gera erro (não trunca); teto generoso, nenhum evento chega perto | RNF (não ADR) | `[09:23] Sofia`, `[09:24] Diego`, `[09:24] Larissa` |
| RNF-03 | Timeout HTTP de 10s | Envio ao cliente que passa de 10s é falha e vai para retry | RNF (não ADR) | `[09:42] Diego` |
| RNF-04 | Latência de entrega | "Tempo real" = abaixo de 10s para os clientes; polling de 2s dá latência mínima de ~2s no pior caso | RNF (não ADR) | `[09:02] Marcos`, `[09:10] Larissa` |
| RNF-05 | Observabilidade via Pino | Logging estruturado do worker, entregas e replays reaproveitando o logger Pino existente com `redact` | RNF (não ADR) | `[09:29] Bruno` |
| RNF-06 | Auditoria do replay | Endpoint admin de replay registra quem executou a ação | RNF (não ADR) | `[09:36] Sofia` |

---

## 5. FORA DE ESCOPO / ADIADO (crítico)

> Nenhum destes itens pode aparecer como requisito nas seções 3 e 4.

| Item | Categoria | Origem `[hh:mm] Nome` |
| --- | --- | --- |
| Notificação por email quando o webhook do cliente falha | Adiado (próxima fase, após medir impacto) | `[09:37] Marcos`, `[09:37] Larissa`, `[09:38] Marcos` |
| Rate limiting de saída (envios ao cliente) | Adiado (observar e decidir depois) | `[09:38] Diego`, `[09:39] Diego`, `[09:39] Larissa` |
| Dashboard / painel visual para o cliente | Descartado (fora de escopo; projeto do time de frontend) | `[09:39] Marcos`, `[09:40] Larissa` |
| Ordering global / múltiplos workers em paralelo | Adiado (limitação conhecida; particionar por `order_id` ou lock pessimista no futuro) | `[09:12] Diego`, `[09:13] Diego`, `[09:13] Larissa` |
| Endurecer roles do CRUD de configuração | Adiado (por enquanto qualquer role autenticada; endurecer mais pra frente) | `[09:36] Marcos`, `[09:37] Sofia` |
| Webhooks inbound (cliente → nós) | Descartado (é só outbound, da plataforma para o cliente) | `[09:02] Sofia`, `[09:02] Marcos`, `[09:03] Sofia` |
| Arquivamento de linhas entregues da outbox (~30 dias) | Fora do escopo desta feature | `[09:08] Diego` |
| Trigger de banco para reatividade do worker | Descartado (MySQL não tem NOTIFY/LISTEN; polling atende) | `[09:09] Diego` |

---

## 6. Questões em aberto (para o RFC)

| Questão | Situação | Origem `[hh:mm] Nome` |
| --- | --- | --- |
| Rate limiting de saída | Não decidido; observar e implementar se virar problema | `[09:38] Diego`, `[09:39] Larissa` |
| Ordering ao escalar para múltiplos workers | Não decidido; futuro via particionamento por `order_id` ou lock pessimista | `[09:13] Bruno`, `[09:13] Diego` |
| Notificação ao cliente sobre webhook com problema (email) | Adiado para próxima fase após medir impacto | `[09:37] Larissa`, `[09:38] Marcos` |
| Endurecimento de roles no CRUD de configuração | Em aberto; pode ser endurecido mais pra frente | `[09:37] Sofia` |

---

## 7. Mapa de integração código ↔ feature (para o FDD e o Tracker)

| Componente da feature | Arquivo real do código | Como se conecta |
| --- | --- | --- |
| Emissão transacional do evento | `src/modules/orders/order.service.ts` | Estender `changeStatus`: inserir na `webhook_outbox` dentro do `this.prisma.$transaction`, após `tx.orderStatusHistory.create` e antes do `refreshed`, via `publishWebhookEvent(tx, order, fromStatus, toStatus)` |
| Eventos possíveis / filtro por status | `src/modules/orders/order.status.ts` | Transições válidas (`transitions`, `SHIPPED → DELIVERED` etc.) definem os `order.status_changed` que podem virar evento e ser filtrados por endpoint |
| Erros `WEBHOOK_*` | `src/shared/errors/app-error.ts`, `src/shared/errors/http-errors.ts` | Novas classes estendem `AppError`/`NotFoundError`/`ValidationError` com códigos `WEBHOOK_NOT_FOUND`, `WEBHOOK_INVALID_URL`, `WEBHOOK_SECRET_REQUIRED` etc. |
| Serialização de erro para JSON | `src/middlewares/error.middleware.ts` | Sem alteração: já converte `AppError`/`ZodError`/erros Prisma em `{ error: { code, message, details } }` |
| Autorização do replay | `src/middlewares/auth.middleware.ts` | `requireRole('ADMIN')` protege `POST /admin/webhooks/dead-letter/:id/replay`; CRUD usa `authenticate` |
| Logging do worker/entregas | `src/shared/logger/index.ts` | Reaproveita `logger` Pino e `redactPaths` para não vazar secret/token em log |
| Entry-point do worker | `src/server.ts`, `src/app.ts` | Molde para o novo `src/worker.ts` (processo separado, PrismaClient próprio, graceful shutdown) |
| Novas tabelas | `prisma/schema.prisma` | `webhook_outbox`, `webhook_dead_letter`, config de webhook e deliveries seguindo `@default(uuid())` e o padrão de índices existente |
| Padrão de módulo e schemas Zod | `src/modules/products/` | `src/modules/webhooks/` replica controller/service/repository/routes/schemas |

---

## Autoverificação

- [x] Todo item tem `[hh:mm] Nome`.
- [x] A seção 5 tem 8 itens; nenhum aparece como requisito nas seções 3/4.
- [x] As 6 decisões-núcleo estão na seção 1, cada uma com alternativa e trade-off.
- [x] A seção 3 tem 10 requisitos funcionais (mínimo 8).
- [x] Salvo em `docs/_work/decision-map.md`.

---

### Ambiguidades marcadas como HIPÓTESE (3 linhas)

1. `HIPÓTESE`: o `customer_id` no cadastro vem no body ou no path — a reunião fecha que **não** vem do JWT (`[09:32] Larissa`), mas não define qual dos dois; deixado em aberto para o FDD.
2. `HIPÓTESE`: a listagem de deliveries menciona "últimos 100" (`[09:34] Marcos`) como exemplo; o limite/paginação exato não foi fechado e seguirá o padrão de paginação existente do projeto.
3. `HIPÓTESE`: nomes de tabelas de config de webhook e de deliveries (ex.: `webhook_endpoints`, `webhook_deliveries`) não foram nomeados literalmente na reunião; inferidos a partir dos campos citados (`[09:21] Bruno`, `[09:34] Marcos`).
