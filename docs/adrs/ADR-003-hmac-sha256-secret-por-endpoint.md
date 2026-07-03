# ADR-003: Assinatura HMAC-SHA256 com secret por endpoint e rotação com grace period

- **Status:** Aceito
- **Data:** 2026-07-03
- **Decisores:** Larissa (Tech Lead), Diego (Eng. Sênior), Bruno (Eng.), Sofia (Segurança), Marcos (PM)
- **Origem:** reunião técnica de Webhooks, ver `TRANSCRICAO.md`

## Contexto

O sistema passa a expor eventos com dados de pedidos para endpoints fora da nossa infraestrutura. O cliente precisa validar que a requisição veio realmente de nós e que ninguém adulterou o payload no caminho (`[09:19] Sofia`). Já houve caso de cliente que vazou secret em log de aplicação, então o modelo de secret precisa limitar o raio de dano e permitir troca sem quebrar a integração (`[09:22] Diego`, `[09:21] Sofia`).

## Decisão

Assinar o corpo do request com **HMAC-SHA256**, enviando a assinatura no header `X-Signature`; o cliente verifica a assinatura do lado dele (`[09:20] Sofia`). Cada endpoint de webhook tem uma **secret única** (não uma secret global da plataforma) (`[09:21] Sofia`). A secret é **rotacionável** via API; ao rotacionar, a secret antiga permanece válida por **24 horas em paralelo** com a nova (grace period), depois é invalidada (`[09:21] Sofia`, `[09:22] Sofia`).

## Alternativas consideradas

### Secret global da plataforma
- Descrição: uma única secret compartilhada para assinar todos os webhooks.
- Por que foi descartada (trade-off): "se vaza uma, vaza tudo"; um vazamento comprometeria todos os clientes (`[09:21] Sofia`).

### Rotação sem grace period
- Descrição: trocar a secret e invalidar a antiga imediatamente.
- Por que foi descartada (trade-off): quebraria a integração do cliente durante a migração dos sistemas dele; o grace de 24h dá tempo para migrar (`[09:21] Sofia`).

## Consequências

**Positivas**
- Cliente valida origem e integridade com biblioteca padrão de mercado (HMAC-SHA256) (`[09:20] Sofia`).
- Vazamento de uma secret afeta apenas um endpoint (`[09:21] Sofia`).
- Rotação sem downtime graças ao grace period de 24h (`[09:21] Sofia`).

**Negativas / trade-offs aceitos**
- Durante o grace period, duas secrets válidas coexistem por endpoint, exigindo lógica de verificação com múltiplas chaves.
- Geração e armazenamento de secret exigem revisão de segurança antes do deploy (`[09:46] Sofia`).

## Relacionados
- [ADR-004: Garantia at-least-once com X-Event-Id](ADR-004-at-least-once-x-event-id.md)
- [ADR-006: Reuso dos padrões existentes do projeto](ADR-006-reuso-padroes-do-projeto.md)
