// Layout HTML compartilhado do site de documentacao viva.
// Sidebar navegavel entre os 5 documentos + cabecalho/rodape com o hash do commit.

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * @param {object} opts
 * @param {string} opts.title      titulo da pagina
 * @param {string} opts.body       HTML ja convertido do Markdown
 * @param {string} opts.commit     hash completo do commit de origem
 * @param {string} opts.generatedAt ISO 8601
 * @param {string} opts.activeId   id do documento ativo (para destacar no menu)
 * @param {string} opts.baseHref   prefixo relativo para a raiz do site (ex.: '' ou '../')
 * @param {Array}  opts.nav        itens do menu principal
 * @param {Array}  opts.adrs       lista de ADRs para o submenu
 */
export function renderPage(opts) {
  const { title, body, commit, generatedAt, activeId, baseHref, nav, adrs } = opts;

  const navLinks = nav
    .map((item) => {
      const href = `${baseHref}${item.out}`;
      const active = item.id === activeId ? ' class="active"' : '';
      return `<li><a href="${escapeAttr(href)}"${active}>${escapeAttr(item.title)}</a>`
        + (item.id === 'adrs' && adrs.length
          ? `<ul class="adr-list">${adrs
              .map((a) => {
                const ahref = `${baseHref}${a.out}`;
                const aactive = a.id === activeId ? ' class="active"' : '';
                return `<li><a href="${escapeAttr(ahref)}"${aactive}>${escapeAttr(a.title)}</a></li>`;
              })
              .join('')}</ul>`
          : '')
        + '</li>';
    })
    .join('\n');

  const shortCommit = commit.slice(0, 12);

  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeAttr(title)} · Documentacao viva</title>
  <link rel="stylesheet" href="${escapeAttr(baseHref)}styles.css" />
</head>
<body>
  <header class="topbar">
    <span class="brand"><a href="${escapeAttr(baseHref)}index.html">Documentacao viva</a></span>
    <span class="commit" title="Commit de origem desta documentacao">
      source_commit: <code>${escapeAttr(commit)}</code>
    </span>
  </header>
  <div class="layout">
    <nav class="sidebar">
      <p class="sidebar-title">Documentos</p>
      <ul>
${navLinks}
      </ul>
    </nav>
    <main class="content">
      <article class="markdown-body">
${body}
      </article>
      <footer class="pagefoot">
        <p>Gerado a partir do commit <code>${escapeAttr(shortCommit)}</code> em ${escapeAttr(generatedAt)}.</p>
      </footer>
    </main>
  </div>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: false });
    const blocks = document.querySelectorAll('code.language-mermaid');
    let i = 0;
    for (const code of blocks) {
      const pre = code.closest('pre');
      const graph = document.createElement('div');
      graph.className = 'mermaid';
      graph.textContent = code.textContent;
      pre.replaceWith(graph);
    }
    try { await mermaid.run(); } catch (e) { /* diagrama opcional */ }
  </script>
</body>
</html>
`;
}

export const STYLES = `:root {
  --bg: #ffffff; --fg: #1f2328; --muted: #656d76; --border: #d0d7de;
  --accent: #0969da; --code-bg: #f6f8fa; --sidebar-bg: #f6f8fa;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: var(--fg); background: var(--bg); }
.topbar { display: flex; justify-content: space-between; align-items: center; padding: 10px 20px; background: #24292f; color: #fff; position: sticky; top: 0; z-index: 10; }
.topbar a { color: #fff; text-decoration: none; }
.topbar .brand { font-weight: 600; }
.topbar .commit { font-size: 12px; color: #d0d7de; }
.topbar .commit code { color: #fff; background: rgba(255,255,255,0.12); padding: 2px 6px; border-radius: 6px; }
.layout { display: flex; align-items: flex-start; }
.sidebar { width: 260px; min-width: 260px; padding: 16px; background: var(--sidebar-bg); border-right: 1px solid var(--border); height: calc(100vh - 44px); position: sticky; top: 44px; overflow-y: auto; }
.sidebar-title { font-size: 12px; text-transform: uppercase; color: var(--muted); letter-spacing: 0.5px; margin: 0 0 8px; }
.sidebar ul { list-style: none; padding-left: 0; margin: 0; }
.sidebar > ul > li { margin: 4px 0; }
.sidebar a { display: block; padding: 4px 8px; border-radius: 6px; color: var(--fg); text-decoration: none; font-size: 14px; }
.sidebar a:hover { background: #eaeef2; }
.sidebar a.active { background: var(--accent); color: #fff; }
.adr-list { margin: 4px 0 8px 10px; border-left: 2px solid var(--border); padding-left: 6px; }
.adr-list a { font-size: 12px; color: var(--muted); }
.content { flex: 1; padding: 24px 40px; max-width: 900px; }
.markdown-body { line-height: 1.6; }
.markdown-body h1 { border-bottom: 1px solid var(--border); padding-bottom: 8px; }
.markdown-body h2 { border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-top: 32px; }
.markdown-body code { background: var(--code-bg); padding: 2px 6px; border-radius: 6px; font-size: 85%; }
.markdown-body pre { background: var(--code-bg); padding: 14px; border-radius: 8px; overflow-x: auto; }
.markdown-body pre code { background: none; padding: 0; }
.markdown-body table { border-collapse: collapse; width: 100%; margin: 12px 0; display: block; overflow-x: auto; }
.markdown-body th, .markdown-body td { border: 1px solid var(--border); padding: 6px 12px; text-align: left; }
.markdown-body th { background: var(--code-bg); }
.markdown-body a { color: var(--accent); }
.markdown-body blockquote { border-left: 4px solid var(--border); margin: 0; padding: 0 16px; color: var(--muted); }
.mermaid { background: #fff; text-align: center; margin: 16px 0; }
.pagefoot { margin-top: 40px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.card { border: 1px solid var(--border); border-radius: 8px; padding: 16px; text-decoration: none; color: var(--fg); }
.card:hover { border-color: var(--accent); }
.card h3 { margin: 0 0 6px; }
`;
