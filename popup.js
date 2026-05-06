// popup.js — Pure UI layer. All logic lives in background.js.

let format = 'url';

const dot         = document.getElementById('dot');
const statusText  = document.getElementById('statusText');
const progressWrap= document.getElementById('progressWrap');
const progFill    = document.getElementById('progFill');
const progLabel   = document.getElementById('progLabel');
const progCount   = document.getElementById('progCount');
const bgHint      = document.getElementById('bgHint');
const harvestBtn  = document.getElementById('harvestBtn');
const harvestLabel= document.getElementById('harvestLabel');
const copyBtn     = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const clearBtn    = document.getElementById('clearBtn');
const cfgPages    = document.getElementById('cfgPages');
const cfgLinks    = document.getElementById('cfgLinks');
const cfgExcludeSocial = document.getElementById('cfgExcludeSocial');

// ── Config: load saved settings, persist on change ─────────────────────────
chrome.storage.local.get('harvesterConfig', r => {
  const cfg = r.harvesterConfig || {};
  if (cfg.maxPages) cfgPages.value = cfg.maxPages;
  if (cfg.maxLinks) cfgLinks.value = cfg.maxLinks;
  if (cfg.excludeSocial !== undefined) cfgExcludeSocial.checked = cfg.excludeSocial;
  else if (cfg.excludeYoutube !== undefined) cfgExcludeSocial.checked = cfg.excludeYoutube; // migration fallback
});

function saveConfig() {
  chrome.storage.local.set({ harvesterConfig: {
    maxPages: parseInt(cfgPages.value) || 5,
    maxLinks: parseInt(cfgLinks.value) || 500,
    excludeSocial: cfgExcludeSocial.checked
  }});
}
cfgPages.addEventListener('change', saveConfig);
cfgLinks.addEventListener('change', saveConfig);
cfgExcludeSocial.addEventListener('change', saveConfig);
const statsBar    = document.getElementById('statsBar');
const sPg         = document.getElementById('sPg');
const sLk         = document.getElementById('sLk');
const sUq         = document.getElementById('sUq');
const linkList    = document.getElementById('linkList');
const toast       = document.getElementById('toast');

// ── Format buttons ─────────────────────────────────────────────────────────
document.querySelectorAll('.fmt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    format = btn.dataset.fmt;
  });
});

// ── Render state from background ───────────────────────────────────────────
function applyState(state) {
  const { status, currentPage, totalPages, links = [] } = state;

  // dot color
  dot.className = 'dot ' + (status === 'running' ? 'running' : status === 'done' ? 'done' : status === 'error' ? 'error' : '');

  // status text
  const msgs = {
    idle:    'Open a Google search, then click Harvest',
    running: `Fetching page ${currentPage + 1} of ${totalPages}…`,
    done:    `✓ Done — ${links.length} unique links from ${totalPages} pages`,
    error:   '⚠ Error: ' + (state.errorMsg || 'unknown')
  };
  statusText.textContent = msgs[status] || '';

  // progress bar
  if (status === 'running' || status === 'done') {
    progressWrap.classList.add('visible');
    const pct = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;
    progFill.style.width = pct + '%';
    progCount.textContent = `${currentPage} / ${totalPages} pages`;
    progLabel.textContent = status === 'done' ? 'Complete!' : `Fetching page ${currentPage + 1}…`;
  } else {
    progressWrap.classList.remove('visible');
  }

  // background hint
  bgHint.classList.toggle('visible', status === 'running');

  // harvest button
  if (status === 'running') {
    harvestBtn.classList.add('cancel-mode');
    harvestLabel.textContent = 'Cancel';
    harvestBtn.disabled = false;
  } else if (status === 'done') {
    harvestBtn.classList.remove('cancel-mode');
    harvestLabel.textContent = 'Harvest All Pages';
    harvestBtn.disabled = true; // Disable until clear
  } else {
    harvestBtn.classList.remove('cancel-mode');
    harvestLabel.textContent = 'Harvest All Pages';
    harvestBtn.disabled = false;
  }

  // lock config inputs while running
  cfgPages.disabled = status === 'running';
  cfgLinks.disabled = status === 'running';
  cfgExcludeSocial.disabled  = status === 'running';

  // copy + download buttons
  copyBtn.disabled = links.length === 0;
  if (links.length === 0) copyBtn.innerHTML = '<span>📋</span> Copy';
  downloadBtn.disabled = links.length === 0;

  // stats
  if (links.length > 0) {
    statsBar.style.display = 'flex';
    const pages = [...new Set(links.map(l => l.page))].length;
    sPg.textContent = pages;
    sLk.textContent = links.length;
    sUq.textContent = links.length; // already deduped in background
  } else {
    statsBar.style.display = 'none';
  }

  // link list
  renderLinks(links);
}

function renderLinks(links) {
  if (!links || links.length === 0) {
    linkList.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div>Go to Google Search, then press<br><strong>Harvest All Pages</strong></div>`;
    return;
  }
  linkList.innerHTML = links.map((l, i) => `
    <div class="link-item">
      <span class="link-num">${i + 1}</span>
      <div class="link-info">
        <div class="link-title">${esc(l.title || l.url)}</div>
        <div class="link-url">${esc(l.url)}</div>
      </div>
      <span class="page-badge">p${l.page}</span>
    </div>
  `).join('');
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildCopyText(links) {
  switch (format) {
    case 'url':      return links.map(l => l.url).join('\n');
    case 'titled':   return links.map(l => `${l.title}\n${l.url}`).join('\n\n');
    case 'markdown': return links.map((l,i) => `${i+1}. [${l.title}](${l.url})`).join('\n');
    case 'numbered': return links.map((l,i) => `${i+1}. ${l.url}`).join('\n');
    default:         return links.map(l => l.url).join('\n');
  }
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── Button handlers ────────────────────────────────────────────────────────
harvestBtn.addEventListener('click', async () => {
  const state = await bgGetState();

  if (state.status === 'running') {
    // Cancel
    chrome.runtime.sendMessage({ action: 'CANCEL_HARVEST' });
    return;
  }

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes('google.com/search')) {
    statusText.textContent = '⚠ Please open a Google Search page first!';
    dot.className = 'dot error';
    return;
  }

  chrome.runtime.sendMessage({
    action: 'START_HARVEST',
    tabId: tab.id,
    tabUrl: tab.url,
    maxPages: parseInt(cfgPages.value) || 5,
    maxLinks: parseInt(cfgLinks.value) || 500,
    excludeSocial: cfgExcludeSocial.checked
  });
});

copyBtn.addEventListener('click', async () => {
  const state = await bgGetState();
  const text = buildCopyText(state.links || []);
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  }
  showToast(`✓ Copied ${(state.links||[]).length} links!`);
  copyBtn.innerHTML = '<span>✓</span> Copied';
});

function buildMarkdown(links, query) {
  const date = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  const header = [
    `# Google Search Results`,
    query ? `**Query:** ${query}` : '',
    `**Date:** ${date}`,
    `**Total links:** ${links.length}`,
    '',
    '---',
    ''
  ].filter(Boolean).join('\n');

  // Group by page
  const byPage = {};
  links.forEach(l => { (byPage[l.page] = byPage[l.page] || []).push(l); });

  const body = Object.keys(byPage).sort((a,b) => a-b).map(page => {
    const items = byPage[page].map((l, i) =>
      `- [${l.title || l.url}](${l.url})`
    ).join('\n');
    return `## Page ${page}\n\n${items}`;
  }).join('\n\n');

  return header + body;
}

function downloadMarkdown(links, query) {
  const md = buildMarkdown(links, query);
  const slug = (query || 'search-results').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const filename = `google-links-${slug}.md`;
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`⬇ Downloaded ${filename}`);
}

downloadBtn.addEventListener('click', async () => {
  const state = await bgGetState();
  const links = state.links || [];
  // Extract query from stored base URL
  let query = '';
  try { query = new URL(state.baseUrl).searchParams.get('q') || ''; } catch (_) {}
  downloadMarkdown(links, query);
});

clearBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'CLEAR' });
});

// ── Communication with background ─────────────────────────────────────────
function bgGetState() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'GET_STATE' }, resolve);
  });
}

// Listen for live updates pushed from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATE_UPDATE') {
    applyState(msg.state);
  }
});

// ── Init: load current state on popup open ─────────────────────────────────
bgGetState().then(state => {
  if (state) applyState(state);
});
