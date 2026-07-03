# ADR-007: Snapshot do payload na inserção da outbox

- **Status:** Aceito
- **Data:** 2026-07-03
- **Decisores:** Larissa (Tech Lead), Diego (Eng. Sênior), Bruno (Eng.)
- **Origem:** reunião técnica de Webhooks, ver `TRANSCRICAO.md`

## Contexto

Ao inserir o evento na `webhook_outbox`, é preciso decidir o que gravar: o payload já renderizado (snapshot do estado no momento da mudança de status) ou apenas o `order_id` para renderizar o payload na hora do envio. Como a entrega pode ocorrer segundos ou horas depois (retry/backoff, ver ADR-002), o pedido pode ter mudado nesse intervalo, gerando casos esquisitos se o payload for renderizado tardiamente (`[09:51] Bruno`, `[09:52] Larissa`).

## Decisão

A outbox guarda o **payload já renderizado na inserção** (snapshot), refletindo o estado de quando o status mudou, e não apenas o `order_id` para renderizar depois (`[09:52] Larissa`, `[09:52] Diego`, `[09:52] Bruno`). O payload segue o formato JSON acordado: `event_id`, `event_type` (`order.status_changed`), timestamp ISO 8601, `order_id`, `order_number`, `from_status`, `to_status`, `customer_id`, `total_cents`, sem `items` para não inflar (`[09:43] Diego`).

## Alternativas consideradas

### Guardar apenas `order_id` e renderizar no envio
- Descrição: persistir só a referência do pedido e montar o payload na hora do disparo.
- Por que foi descartada (trade-off): se o pedido mudar entre a inserção e o envio (especialmente após retries), o evento entregue não refletiria o estado da mudança que o gerou, criando inconsistência (`[09:52] Larissa`).

## Consequências

**Positivas**
- O evento entregue sempre reflete o estado de quando o status mudou, mesmo após horas de retry (`[09:52] Larissa`).
- Envio não depende de reler o pedido, simplificando o worker.

**Negativas / trade-offs aceitos**
- Duplicação de dados: o payload fica materializado na outbox, ocupando mais espaço (aceito; mitigado pelo arquivamento futuro das linhas entregues, `[09:08] Diego`).

## Relacionados
- [ADR-001: Padrão Outbox transacional no MySQL](ADR-001-outbox-no-mysql.md)
- [ADR-004: Garantia at-least-once com X-Event-Id](ADR-004-at-least-once-x-event-id.md)
