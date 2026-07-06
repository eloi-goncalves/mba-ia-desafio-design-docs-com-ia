# Tooling de Documentacao Viva (Fase 2)

Scripts que renderizam os design docs em HTML e mantem a documentacao sincronizada
com o codigo, direcionados pelo Tracker. Nao fazem parte do codigo da aplicacao.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `generate-html.mjs` | Artefato 1 + 2: gera `docs/site/` (HTML navegavel) e `docs/site/docs-meta.json`. |
| `update-docs.mjs` | Artefato 3: mecanismo de auto-atualizacao (contrato de 5 etapas). |
| `template.mjs` | Layout HTML (sidebar navegavel + hash do commit visivel). |
| `lib.mjs` | Helpers: git, parser do Tracker, roteamento e lista de documentos. |

## Comandos exatos

```bash
# Gera o site estatico + docs-meta.json (ancorado no HEAD atual)
npm run docs:build

# Auto-update direcionado (etapas 1 a 4): le a ancora, calcula git diff <source_commit>..HEAD,
# roteia pelo Tracker (linhas Fonte = CODIGO) e emite prompts direcionados
# em docs/_work/update-prompts/. Reporta "sem impacto documental" se nada casar.
npm run docs:update

# Etapa 5: apos aplicar as edicoes de Markdown indicadas pelos prompts,
# regera o HTML e grava source_commit = HEAD em docs-meta.json.
npm run docs:update -- --apply
```

## Contrato de 5 etapas (`docs:update`)

1. Le `source_commit` de `docs/site/docs-meta.json`.
2. Roda `git diff <source_commit>..HEAD` para achar arquivos de codigo alterados.
3. Usa as linhas do Tracker com `Fonte = CODIGO` para mapear arquivo alterado -> documento afetado.
4. Monta, por documento afetado, um prompt com apenas o trecho atual + o diff; o operador aplica no Markdown.
5. Regera o HTML e grava `source_commit = HEAD` (via `--apply`).

A etapa 3 e o diferencial: update direcionado, nao regeneracao cega. Se nenhum
arquivo alterado casar com o Tracker, o mecanismo reporta "sem impacto documental"
e nao toca em documento nenhum.

## Seguranca

Nenhum segredo e commitado. A integracao de IA e assistida (prompt gerado +
operador aplica), entao nao ha chave de API no repositorio. Se futuramente a
etapa 4 for automatizada via API, a chave deve ser lida de variavel de ambiente.
O gerador usa `markdown-it` com `html: false`, escapando HTML embutido nos
Markdown para mitigar XSS.
