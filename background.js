// background.js — Service Worker
// Owns all harvesting state. Survives popup open/close.

const HARD_MAX_PAGES = 50;
const HARD_MAX_LINKS = 5000;

// Initial state shape
const DEFAULT_STATE = {
  status: 'idle',
  currentPage: 0,
  totalPages: 5,
  maxLinks: 500,
  links: [],
  baseUrl: null,
  harvestTabId: null,
  startedAt: null,
  finishedAt: null,
  errorMsg: null
};

// ── State helpers ────────────────────────────────────────────────────────────

async function getState() {
  return new Promise(resolve => {
    chrome.storage.local.get('harvesterState', r => {
      resolve(r.harvesterState || { ...DEFAULT_STATE });
    });
  });
}

async function setState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  return new Promise(resolve => {
    chrome.storage.local.set({ harvesterState: next }, () => resolve(next));
  });
}

async function resetState() {
  return new Promise(resolve => {
    chrome.storage.local.set({ harvesterState: { ...DEFAULT_STATE } }, resolve);
  });
}

// Broadcast state to any open popup
function broadcast(state) {
  chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state }).catch(() => {});
}

// ── Tab helpers ──────────────────────────────────────────────────────────────

function navigateAndWait(tabId, url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { url }, (tab) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);

      const listener = (changedTabId, changeInfo) => {
        if (changedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 900); // let JS render
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

function extractLinksFromTab(tabId) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript(
      { target: { tabId }, files: ['content.js'] },
      () => {
        if (chrome.runtime.lastError) return resolve([]);
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { action: 'extractLinks' }, (response) => {
            if (chrome.runtime.lastError || !response) return resolve([]);
            resolve(response.links || []);
          });
        }, 700);
      }
    );
  });
}

function buildPageUrl(baseUrl, pageIndex) {
  const url = new URL(baseUrl);
  url.searchParams.set('start', pageIndex * 10);
  // strip session/click params that can cause redirects
  ['ei','ved','sa','sxsrf','source','gs_lcp','sclient'].forEach(p => url.searchParams.delete(p));
  return url.toString();
}

// ── Core harvest loop ────────────────────────────────────────────────────────

async function runHarvest(tabId, baseUrl, maxPages, maxLinks) {
  maxPages = Math.min(Math.max(parseInt(maxPages) || 5, 1), HARD_MAX_PAGES);
  maxLinks = Math.min(Math.max(parseInt(maxLinks) || 500, 1), HARD_MAX_LINKS);

  await setState({
    status: 'running',
    currentPage: 0,
    totalPages: maxPages,
    maxLinks,
    links: [],
    baseUrl,
    harvestTabId: tabId,
    startedAt: Date.now(),
    finishedAt: null,
    errorMsg: null
  });

  broadcast(await getState());

  let allLinks = [];

  for (let page = 0; page < maxPages; page++) {
    // Check if harvest was cancelled between pages
    const check = await getState();
    if (check.status !== 'running') break;

    // Stop early if maxLinks already reached
    if (allLinks.length >= maxLinks) break;

    try {
      if (page === 0) {
        await new Promise(r => setTimeout(r, 600));
      } else {
        const nextUrl = buildPageUrl(baseUrl, page);
        await navigateAndWait(tabId, nextUrl);
      }

      const links = await extractLinksFromTab(tabId);
      const tagged = links.map(l => ({ ...l, page: page + 1 }));
      allLinks = allLinks.concat(tagged);

      // Deduplicate and enforce maxLinks cap
      const seen = new Set();
      const deduped = allLinks.filter(l => {
        if (seen.has(l.url)) return false;
        seen.add(l.url);
        return true;
      }).slice(0, maxLinks);

      allLinks = deduped;

      await setState({ currentPage: page + 1, links: deduped });
      broadcast(await getState());
    } catch (err) {
      await setState({ status: 'error', errorMsg: err.message });
      broadcast(await getState());
      return;
    }
  }

  // Navigate back to page 1
  try {
    await navigateAndWait(tabId, buildPageUrl(baseUrl, 0));
  } catch (_) {}

  await setState({ status: 'done', finishedAt: Date.now() });
  broadcast(await getState());

  const finalState = await getState();
  chrome.action.setBadgeText({ text: String(finalState.links.length) });
  chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' });
}

// ── Message handler (from popup) ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === 'GET_STATE') {
    getState().then(sendResponse);
    return true;
  }

  if (message.action === 'START_HARVEST') {
    const { tabId, tabUrl, maxPages, maxLinks } = message;
    runHarvest(tabId, tabUrl, maxPages, maxLinks).catch(async (err) => {
      await setState({ status: 'error', errorMsg: err.message });
      broadcast(await getState());
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === 'CANCEL_HARVEST') {
    setState({ status: 'idle' }).then(async () => {
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.action === 'CLEAR') {
    resetState().then(async () => {
      chrome.action.setBadgeText({ text: '' });
      broadcast(await getState());
      sendResponse({ ok: true });
    });
    return true;
  }
});
