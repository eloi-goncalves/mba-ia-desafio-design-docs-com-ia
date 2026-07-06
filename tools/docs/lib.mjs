// Helpers compartilhados pelo tooling de documentacao viva (Fase 2).
// Nao e codigo da aplicacao: vive em tools/docs/ e so manipula os design docs.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// tools/docs/ -> raiz do repositorio
export const REPO_ROOT = resolve(here, '..', '..');
export const DOCS_DIR = join(REPO_ROOT, 'docs');
export const SITE_DIR = join(DOCS_DIR, 'site');
export const ADRS_DIR = join(DOCS_DIR, 'adrs');

/** Executa um comando git a partir da raiz do repositorio e devolve stdout (trim). */
export function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

/** Hash completo do HEAD. */
export function headCommit() {
  return git(['rev-parse', 'HEAD']);
}

/**
 * Lista dos documentos cobertos pelo site, na ordem de navegacao.
 * ADRs sao expandidos dinamicamente a partir de docs/adrs/.
 */
export function listDocuments() {
  const adrFiles = readdirSync(ADRS_DIR)
    .filter((f) => /^ADR-\d+.*\.md$/.test(f))
    .sort();

  return {
    top: [
      { id: 'prd', title: 'PRD', source: 'docs/PRD.md', out: 'prd.html' },
      { id: 'rfc', title: 'RFC', source: 'docs/RFC.md', out: 'rfc.html' },
      { id: 'fdd', title: 'FDD', source: 'docs/FDD.md', out: 'fdd.html' },
      { id: 'adrs', title: 'ADRs', source: 'docs/adrs/', out: 'adrs/index.html' },
      { id: 'tracker', title: 'Tracker', source: 'docs/TRACKER.md', out: 'tracker.html' },
    ],
    adrs: adrFiles.map((f) => ({
      id: f.replace(/\.md$/, ''),
      title: f.replace(/\.md$/, ''),
      source: `docs/adrs/${f}`,
      out: `adrs/${f.replace(/\.md$/, '')}.html`,
    })),
  };
}

/** Le um arquivo de texto a partir de um caminho relativo a raiz do repo. */
export function readRepoFile(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), 'utf8');
}

/**
 * Parser do Tracker: le docs/TRACKER.md, isola as linhas da tabela e devolve
 * apenas as entradas com Fonte = CODIGO, ja com o caminho de codigo (Localizacao).
 * Colunas esperadas: ID | Documento | Tipo | Conteudo | Fonte | Localizacao
 */
export function parseTrackerCodeRows() {
  const md = readRepoFile('docs/TRACKER.md');
  const rows = [];
  for (const line of md.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 6) continue;
    const [id, documento, tipo, resumo, fonte, localizacao] = cells;
    // pula cabecalho e separador
    if (id === 'ID' || /^-+$/.test(id.replace(/\s/g, ''))) continue;
    if (fonte !== 'CODIGO') continue;
    rows.push({ id, documento, tipo, resumo, arquivo: localizacao });
  }
  return rows;
}

/**
 * Roteia arquivos de codigo alterados -> documentos afetados, usando o Tracker.
 * Retorna um mapa { documento: { ids: [], arquivos: Set } } apenas com matches.
 */
export function routeChangedFiles(changedFiles) {
  const codeRows = parseTrackerCodeRows();
  const affected = new Map();
  for (const file of changedFiles) {
    for (const row of codeRows) {
      if (row.arquivo === file) {
        if (!affected.has(row.documento)) {
          affected.set(row.documento, { ids: [], arquivos: new Set() });
        }
        const entry = affected.get(row.documento);
        entry.ids.push(row.id);
        entry.arquivos.add(file);
      }
    }
  }
  return affected;
}
