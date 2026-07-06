// Artefato 1 + Artefato 2 (Fase 2).
// Gera docs/site/ (HTML navegavel dos 5 documentos, com o hash do commit visivel)
// e docs/site/docs-meta.json. Reproduzivel: `npm run docs:build`.
//
// Regras: nao altera codigo da aplicacao; HTML gerado por comando; XSS mitigado
// via markdown-it com html:false (HTML embutido nos Markdown e escapado).

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import MarkdownIt from 'markdown-it';

import {
  SITE_DIR,
  ADRS_DIR,
  headCommit,
  listDocuments,
  readRepoFile,
} from './lib.mjs';
import { renderPage, STYLES } from './template.mjs';

const md = new MarkdownIt({
  html: false, // nao renderiza HTML bruto -> mitiga XSS de HTML embutido
  linkify: true,
  breaks: false,
});

function build() {
  const commit = headCommit();
  const generatedAt = new Date().toISOString();
  const docs = listDocuments();

  // Comeca do zero para garantir reprodutibilidade.
  rmSync(SITE_DIR, { recursive: true, force: true });
  mkdirSync(SITE_DIR, { recursive: true });
  mkdirSync(join(SITE_DIR, 'adrs'), { recursive: true });

  writeFileSync(join(SITE_DIR, 'styles.css'), STYLES, 'utf8');

  const nav = docs.top;
  const generated = [];

  const write = (relOut, html) => {
    const full = join(SITE_DIR, relOut);
    writeFileSync(full, html, 'utf8');
    generated.push(join('docs/site', relOut));
  };

  const pageFor = (source, out, title, activeId) => {
    const baseHref = out.includes('/') ? '../' : '';
    const body = md.render(readRepoFile(source));
    return renderPage({ title, body, commit, generatedAt, activeId, baseHref, nav, adrs: docs.adrs });
  };

  // PRD, RFC, FDD, Tracker
  write('prd.html', pageFor('docs/PRD.md', 'prd.html', 'PRD', 'prd'));
  write('rfc.html', pageFor('docs/RFC.md', 'rfc.html', 'RFC', 'rfc'));
  write('fdd.html', pageFor('docs/FDD.md', 'fdd.html', 'FDD', 'fdd'));
  write('tracker.html', pageFor('docs/TRACKER.md', 'tracker.html', 'Tracker', 'tracker'));

  // ADRs: uma pagina por ADR
  for (const adr of docs.adrs) {
    write(adr.out, pageFor(adr.source, adr.out, adr.title, adr.id));
  }

  // Indice de ADRs
  const adrCards = docs.adrs
    .map((a) => {
      const title = readRepoFile(a.source).split('\n').find((l) => l.startsWith('#')) || a.title;
      const clean = title.replace(/^#+\s*/, '');
      return `<a class="card" href="${a.id}.html"><h3>${a.title}</h3><p>${clean}</p></a>`;
    })
    .join('\n');
  const adrsBody = `<h1>ADRs</h1>\n<p>Architecture Decision Records desta feature.</p>\n<div class="cards">\n${adrCards}\n</div>`;
  write(
    'adrs/index.html',
    renderPage({
      title: 'ADRs',
      body: adrsBody,
      commit,
      generatedAt,
      activeId: 'adrs',
      baseHref: '../',
      nav,
      adrs: docs.adrs,
    }),
  );

  // Capa / index
  const indexBody = `<h1>Documentacao viva: Sistema de Webhooks de Notificacao de Pedidos</h1>
<p>Versao navegavel do pacote de design docs, gerada por comando reproduzivel a partir do Markdown.</p>
<p><strong>Commit de origem:</strong> <code>${commit}</code></p>
<div class="cards">
  <a class="card" href="prd.html"><h3>PRD</h3><p>Problema, publico, escopo e metricas.</p></a>
  <a class="card" href="rfc.html"><h3>RFC</h3><p>Proposta tecnica, alternativas e questoes em aberto.</p></a>
  <a class="card" href="fdd.html"><h3>FDD</h3><p>Especificacao de implementacao.</p></a>
  <a class="card" href="adrs/index.html"><h3>ADRs</h3><p>Decisoes arquiteturais.</p></a>
  <a class="card" href="tracker.html"><h3>Tracker</h3><p>Rastreabilidade item a item.</p></a>
</div>`;
  write(
    'index.html',
    renderPage({
      title: 'Inicio',
      body: indexBody,
      commit,
      generatedAt,
      activeId: 'home',
      baseHref: '',
      nav,
      adrs: docs.adrs,
    }),
  );

  // Artefato 2: docs-meta.json
  const meta = {
    source_commit: commit,
    generated_at: generatedAt,
    documents: ['docs/PRD.md', 'docs/RFC.md', 'docs/FDD.md', 'docs/adrs/', 'docs/TRACKER.md'],
  };
  writeFileSync(join(SITE_DIR, 'docs-meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');
  generated.push('docs/site/docs-meta.json');

  // Relatorio
  console.log('docs:build concluido.');
  console.log(`  comando: npm run docs:build`);
  console.log(`  source_commit: ${commit}`);
  console.log(`  generated_at: ${generatedAt}`);
  console.log('  arquivos gerados em docs/site/:');
  for (const f of generated.sort()) console.log(`    - ${f}`);
  void ADRS_DIR; // referencia mantida para clareza da estrutura
}

build();
