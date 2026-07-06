// Artefato 3 (Fase 2): mecanismo de auto-atualizacao direcionado pelo Tracker.
// Ponto de entrada unico: `npm run docs:update` (etapas 1 a 4) e
// `npm run docs:update -- --apply` (etapa 5: regera HTML + re-ancora).
//
// Contrato fixo de 5 etapas (do enunciado da Parte 2):
//   1. Le source_commit de docs/site/docs-meta.json
//   2. git diff <source_commit>..HEAD -> arquivos de codigo alterados
//   3. Usa linhas do Tracker com Fonte = CODIGO para mapear arquivo -> documento
//   4. Envia a IA apenas os trechos afetados + o diff e aplica nos Markdown
//   5. Regera o HTML e grava source_commit = HEAD em docs-meta.json
//
// Update direcionado, nao cego: sem match no Tracker => "sem impacto documental".
// Nao altera codigo de aplicacao (so le o diff). Sem segredos no repositorio.

import { execSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, SITE_DIR, DOCS_DIR, git, headCommit, routeChangedFiles, readRepoFile } from './lib.mjs';

const META_PATH = join(SITE_DIR, 'docs-meta.json');
const PROMPTS_DIR = join(DOCS_DIR, '_work', 'update-prompts');
const APPLY = process.argv.includes('--apply');

const PROMPT_TEMPLATE = ({ caminho, ids, trecho, arquivo, diff }) => `Voce esta atualizando UM design doc para refletir uma mudanca de codigo.
NAO reescreva o documento inteiro. Altere apenas os trechos impactados.

Documento: ${caminho}
Itens do Tracker afetados: ${ids}
Trecho atual do documento:
---
${trecho}
---
Diff do codigo (${arquivo}):
---
${diff}
---
Regra: mantenha o estilo e a rastreabilidade. Produza apenas o trecho atualizado.
`;

/** Etapa 1: le a ancora. */
function readAnchor() {
  const meta = JSON.parse(readFileSync(META_PATH, 'utf8'));
  if (!meta.source_commit) throw new Error('docs-meta.json sem source_commit');
  return meta;
}

/** Etapa 2: arquivos alterados entre source_commit e HEAD. */
function changedFiles(sourceCommit, head) {
  if (sourceCommit === head) return [];
  const out = execSync(`git diff --name-only ${sourceCommit}..${head}`, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
  return out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

/** Diff textual de um arquivo especifico. */
function diffForFile(sourceCommit, head, file) {
  return execFileSync('git', ['diff', `${sourceCommit}..${head}`, '--', file], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

/**
 * Extrai do Markdown os trechos que citam algum dos arquivos de codigo afetados
 * ou os IDs do Tracker. Devolve blocos de linhas com contexto (o "trecho atual").
 */
function extractExcerpt(docRelPath, arquivos, ids) {
  const md = readRepoFile(docRelPath);
  const lines = md.split('\n');
  const needles = [...arquivos, ...ids];
  const keep = new Set();
  lines.forEach((line, i) => {
    if (needles.some((n) => line.includes(n))) {
      for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j++) keep.add(j);
    }
  });
  if (keep.size === 0) return '(nenhum trecho citando os arquivos; revisar o documento inteiro manualmente)';
  const idx = [...keep].sort((a, b) => a - b);
  const chunks = [];
  let prev = -2;
  let buf = [];
  for (const i of idx) {
    if (i !== prev + 1 && buf.length) {
      chunks.push(buf.join('\n'));
      buf = [];
    }
    buf.push(lines[i]);
    prev = i;
  }
  if (buf.length) chunks.push(buf.join('\n'));
  return chunks.join('\n...\n');
}

/** Etapa 5: regera HTML e re-ancora docs-meta.json em HEAD. */
function regenerateAndReanchor() {
  execSync('node tools/docs/generate-html.mjs', { cwd: REPO_ROOT, stdio: 'inherit' });
  // generate-html ja grava source_commit = HEAD atual; confirma o valor.
  const meta = JSON.parse(readFileSync(META_PATH, 'utf8'));
  console.log(`\nEtapa 5 concluida: HTML regerado, source_commit = ${meta.source_commit}`);
}

function main() {
  const head = headCommit();

  if (APPLY) {
    // Etapa 5 (executada apos o operador aplicar as edicoes dos prompts).
    console.log('docs:update --apply (etapa 5): regenerando HTML e re-ancorando docs-meta.json...');
    regenerateAndReanchor();
    return;
  }

  // Etapa 1
  const meta = readAnchor();
  const sourceCommit = meta.source_commit;
  console.log(`Etapa 1: source_commit ancorado = ${sourceCommit}`);
  console.log(`         HEAD atual              = ${head}`);

  // Etapa 2
  const files = changedFiles(sourceCommit, head);
  if (files.length === 0) {
    console.log('\nEtapa 2: nenhum arquivo alterado entre source_commit e HEAD.');
    console.log('Resultado: sem impacto documental.');
    return;
  }
  console.log(`\nEtapa 2: arquivos alterados (${files.length}):`);
  files.forEach((f) => console.log(`  - ${f}`));

  // Etapa 3
  const affected = routeChangedFiles(files);
  if (affected.size === 0) {
    console.log('\nEtapa 3: nenhum arquivo alterado casa com linhas Fonte = CODIGO do Tracker.');
    console.log('Resultado: sem impacto documental.');
    return;
  }
  console.log('\nEtapa 3: roteamento pelo Tracker (Fonte = CODIGO):');
  for (const [doc, info] of affected) {
    console.log(`  ${doc}  <=  ${[...info.arquivos].join(', ')}  (IDs: ${info.ids.join(', ')})`);
  }

  // Etapa 4 (assistida): gera um prompt direcionado por documento afetado.
  rmSync(PROMPTS_DIR, { recursive: true, force: true });
  mkdirSync(PROMPTS_DIR, { recursive: true });
  console.log('\nEtapa 4: gerando prompts direcionados (apenas trechos afetados + diff):');
  for (const [doc, info] of affected) {
    const arquivos = [...info.arquivos];
    const diff = arquivos.map((f) => diffForFile(sourceCommit, head, f)).join('\n');
    const trecho = extractExcerpt(doc, arquivos, info.ids);
    const prompt = PROMPT_TEMPLATE({
      caminho: doc,
      ids: info.ids.join(', '),
      trecho,
      arquivo: arquivos.join(', '),
      diff,
    });
    const outName = doc.replace(/[\/]/g, '__') + '.md';
    writeFileSync(join(PROMPTS_DIR, outName), prompt, 'utf8');
    console.log(`  - docs/_work/update-prompts/${outName}  (${doc})`);
  }

  console.log('\nProximo passo:');
  console.log('  1. Aplique nos Markdown as atualizacoes descritas pelos prompts acima.');
  console.log('  2. Rode: npm run docs:update -- --apply');
  console.log('     (etapa 5: regera o HTML e grava source_commit = HEAD)');
}

main();
