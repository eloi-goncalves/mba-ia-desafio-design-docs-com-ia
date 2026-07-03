# ADR-004: Garantia at-least-once com X-Event-Id

- **Status:** Aceito
- **Data:** 2026-07-03
- **Decisores:** Larissa (Tech Lead), Diego (Eng. Sênior), Bruno (Eng.), Sofia (Segurança), Marcos (PM)
- **Origem:** reunião técnica de Webhooks, ver `TRANSCRICAO.md`

## Contexto

Com retry e um worker que marca o resultado após o envio, é possível que o cliente receba o mesmo evento mais de uma vez (ex.: entrega bem-sucedida cujo registro de sucesso falhou antes de ser persistido). O sistema precisa de uma garantia de entrega clara e de um mecanismo para o cliente lidar com duplicatas (`[09:24] Diego`, `[09:25] Bruno`).

## Decisão

Adotar a garantia **at-least-once**: o cliente pode receber o mesmo evento mais de uma vez e deve estar preparado para deduplicar. Para isso, cada evento carrega um **`X-Event-Id`** (UUID único gerado quando o evento entra na `webhook_outbox`), enviado no header; o cliente deduplica pelo `event_id` do lado dele (`[09:24] Diego`, `[09:25] Diego`, `[09:26] Larissa`). É o padrão de mercado adotado por Stripe e GitHub (`[09:25] Diego`).

## Alternativas consideradas

### Exactly-once
- Descrição: garantir que cada evento seja entregue e processado exatamente uma vez.
- Por que foi descartada (trade-off): exigiria coordenação dos dois lados e ficaria muito mais complexo; at-least-once com `event_id` resolve 99% dos casos (`[09:25] Diego`).

### At-least-once sem identificador de evento
- Descrição: reentregar sem enviar um id estável do evento.
- Por que foi descartada (trade-off): sem `X-Event-Id`, o cliente não conseguiria diferenciar uma reentrega de um evento novo (`[09:25] Diego`).

## Consequências

**Positivas**
- Modelo simples de implementar, alinhado ao padrão de mercado (`[09:25] Diego`).
- `X-Event-Id` (UUID gerado na inserção da outbox) dá ao cliente uma chave estável de deduplicação (`[09:25] Diego`).

**Negativas / trade-offs aceitos**
- Joga a responsabilidade de deduplicação para o cliente (`[09:25] Sofia`); será documentado com destaque no portal do desenvolvedor (`[09:26] Marcos`).

## Relacionados
- [ADR-003: Assinatura HMAC-SHA256 com secret por endpoint](ADR-003-hmac-sha256-secret-por-endpoint.md)
- [ADR-007: Snapshot do payload na outbox](ADR-007-snapshot-do-payload-na-outbox.md)
