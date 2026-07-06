# Fase 2: Changeset de demonstracao (SHIPPED -> CANCELLED)

Este diretorio e fornecido pelo desafio. Ele contem a unica alteracao de codigo
sancionada em todo o desafio: uma nova transicao na maquina de estados de pedidos.

## O que muda

Hoje, em `src/modules/orders/order.status.ts`, um pedido `SHIPPED` so pode ir para
`DELIVERED`:

```ts
[OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
```

O changeset passa a permitir tambem `SHIPPED -> CANCELLED` (ex.: pedido enviado que
precisa ser cancelado por devolucao/extravio):

```ts
[OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
```

## Como aplicar (gatilho da demonstracao da Parte 2)

```bash
git apply fase-2/order-status-change.patch
git add -A
git commit -m "feat(orders): permite transição SHIPPED -> CANCELLED (changeset fase 2)"

# dispara o mecanismo de documentacao viva
npm run docs:update
# apos aplicar as edicoes indicadas pelos prompts direcionados:
npm run docs:update -- --apply
```

Resultado esperado: o mecanismo detecta a mudanca em `src/modules/orders/order.status.ts`,
roteia pelo Tracker (linha `FDD-INT-02`, `Fonte = CODIGO`) ate `docs/FDD.md`, atualiza o
documento para refletir a nova transicao e re-ancora `docs/site/docs-meta.json` no HEAD.
