// content.js — injected into Google Search pages by background.js

function extractLinksFromPage() {
  const seen = new Set();
  const links = [];

  const selectors = [
    'div#search a[href^="http"]',
    'div.g a[href^="http"]',
    'div[data-sokoban-container] a[href^="http"]',
    'a[jsname][href^="http"]'
  ];

  for (const selector of selectors) {
    try {
      document.querySelectorAll(selector).forEach(a => {
        const href = a.href;
        if (!href || seen.has(href)) return;

        const skip = [
          'google.com', 'gstatic.com', 'googleapis.com',
          'youtube.com/results', 'accounts.', 'support.google'
        ];
        if (skip.some(s => href.includes(s))) return;

        seen.add(href);

        const titleEl =
          a.querySelector('h3') ||
          a.closest('[data-sokoban-container]')?.querySelector('h3') ||
          a.closest('.g')?.querySelector('h3');

        links.push({
          url: href,
          title: (titleEl?.innerText || a.innerText || '').trim().slice(0, 120) || href
        });
      });
    } catch (_) {}
  }

  return links;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractLinks') {
    sendResponse({ links: extractLinksFromPage() });
  }
  return true;
});
