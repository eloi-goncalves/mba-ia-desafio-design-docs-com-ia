# ADR-002: Retry com backoff exponencial e DLQ em tabela separada

- **Status:** Aceito
- **Data:** 2026-07-03
- **Decisores:** Larissa (Tech Lead), Diego (Eng. Sênior), Bruno (Eng.), Sofia (Segurança), Marcos (PM)
- **Origem:** reunião técnica de Webhooks, ver `TRANSCRICAO.md`

## Contexto

Um endpoint de cliente pode estar temporariamente indisponível (ex.: manutenção planejada de até duas horas já observada em cliente real). O sistema precisa reter e reentregar o evento sem deixá-lo pendurado para sempre nem descartá-lo cedo demais (`[09:14] Larissa`, `[09:16] Diego`). Também é necessário um destino claro para eventos que esgotam as tentativas, servindo de evidência para debug e reprocessamento (`[09:18] Diego`).

## Decisão

Aplicar **retry com backoff exponencial de 5 tentativas**, nos intervalos **1m/5m/30m/2h/12h** (quase 15h entre a primeira falha e a última tentativa) (`[09:17] Diego`, `[09:17] Larissa`). Após esgotar as tentativas, o evento é movido para uma tabela separada `webhook_dead_letter`, contendo payload, motivo da falha e timestamp (`[09:18] Diego`). O reprocessamento é manual, via endpoint admin (ver ADR relacionado e FDD).

## Alternativas consideradas

### 3 tentativas
- Descrição: limitar a 3 tentativas, política mais agressiva.
- Por que foi descartada (trade-off): mataria o evento em ~30 minutos e não cobriria indisponibilidade de duas horas de manutenção planejada de um cliente (`[09:16] Diego`).

### Retry indefinido com backoff
- Descrição: retentar para sempre com intervalos crescentes.
- Por que foi descartada (trade-off): deixa o evento pendurado indefinidamente se o cliente sumiu de vez (`[09:15] Diego`).

### Marcar "failed" na própria outbox
- Descrição: manter o evento falho na `webhook_outbox` marcado como `failed`.
- Por que foi descartada (trade-off): uma tabela `webhook_dead_letter` separada mantém a outbox principal limpa e serve de evidência para debug e reprocessamento (`[09:18] Diego`).

## Consequências

**Positivas**
- Cobre janelas realistas de indisponibilidade do cliente sem intervenção manual (`[09:16] Diego`).
- Outbox principal permanece enxuta; DLQ concentra os casos que exigem atenção (`[09:18] Diego`).

**Negativas / trade-offs aceitos**
- Um evento pode levar até ~15h para chegar à DLQ, atrasando a percepção de falha permanente (`[09:17] Diego`).
- Reprocessamento é manual; não há reprocessamento automático da DLQ (`[09:18] Diego`).

## Relacionados
- [ADR-001: Padrão Outbox transacional no MySQL](ADR-001-outbox-no-mysql.md)
- [ADR-005: Worker em processo separado com polling](ADR-005-worker-separado-polling.md)
