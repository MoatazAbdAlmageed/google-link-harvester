# 🔗 Google Link Harvester

A Chrome extension that automatically collects all search result links across multiple Google pages and lets you copy or download them in bulk — all while running silently in the background.

---

## Features

- **Background harvesting** — closes the popup and it keeps going; reopen anytime to check progress
- **Configurable depth** — set how many pages (1–50) and how many links (1–5000) to collect
- **4 export formats** — URLs only, Title + URL, Markdown, or Numbered list
- **Download as Markdown** — saves a `.md` file grouped by page with titles and URLs
- **Auto-deduplication** — duplicate URLs are filtered out automatically
- **Live progress bar** — shows current page and total links as they're collected
- **Toolbar badge** — displays the final link count on the extension icon when done
- **Persistent settings** — your page/link limits are remembered across sessions

---

## Installation

This extension is not on the Chrome Web Store. Install it manually in Developer Mode:

1. Download and **unzip** the release ZIP
2. Open Chrome and navigate to `chrome://extensions/`
3. Toggle **Developer mode** on (top-right corner)
4. Click **Load unpacked**
5. Select the unzipped `google-link-harvester` folder
6. The extension icon will appear in your toolbar (pin it for easy access)

---

## How to Use

### Basic workflow

1. Go to **google.com** and run any search
2. Click the **🔗 Google Link Harvester** icon in your toolbar
3. *(Optional)* Adjust **Max pages** and **Max links** in the config row
4. Click **⚡ Harvest All Pages**
5. The extension navigates through pages automatically in the background
6. When done, click **📋 Copy** or **⬇ .md** to export your links

### You can close the popup

Once harvesting starts, the background service worker takes over. You can close the popup, switch tabs, or keep browsing — the harvester will finish on its own. Reopen the popup at any time to see progress or grab results.

---

## Configuration

| Setting | Default | Range | Description |
|---|---|---|---|
| Max pages | 5 | 1 – 50 | Number of Google result pages to crawl |
| Max links | 500 | 1 – 5000 | Stop collecting once this many unique links are found |

Settings are saved automatically and persist across browser sessions.

---

## Export Formats

| Format | Example output |
|---|---|
| **URLs only** | `https://example.com` |
| **Title + URL** | `Example Site`<br>`https://example.com` |
| **Markdown** | `1. [Example Site](https://example.com)` |
| **Numbered** | `1. https://example.com` |

The **⬇ .md** download button always exports in Markdown format, with links grouped by page and the search query included in the file header. The filename is auto-generated from your search query, e.g. `google-links-best-python-tutorials.md`.

---

## File Structure

```
google-link-harvester/
├── manifest.json     # Extension manifest (MV3)
├── background.js     # Service worker — owns all harvesting logic and state
├── content.js        # Injected into Google pages to extract result links
├── popup.html        # Extension popup UI
├── popup.js          # UI logic — reads/displays state from background worker
└── icon.png          # Extension icon
```

### Architecture

```
popup.js  ──── START_HARVEST ──►  background.js
              GET_STATE      ──►  (chrome.storage.local)
              CANCEL / CLEAR ──►

background.js  ──── STATE_UPDATE ──►  popup.js (if open)
               ──── navigates Google tab page by page
               ──── injects content.js to extract links
               ──── deduplicates + enforces limits
               ──── persists full state between popup open/close
```

The popup is a pure display layer. Closing it has no effect on an active harvest.

---

## Permissions

| Permission | Reason |
|---|---|
| `scripting` | Inject the link-extraction script into Google Search pages |
| `tabs` | Read the current tab URL and navigate pages |
| `storage` | Persist harvest state and settings across popup sessions |
| `host_permissions: google.com` | Required to run scripts on Google Search |

No data is sent anywhere. Everything runs locally in your browser.

---

## Limitations

- Only works on **google.com/search** pages
- Google occasionally renders results differently; the extractor uses multiple CSS selector strategies to handle this
- Very deep crawls (20+ pages) may be slow due to per-page navigation delays built in to let Google render fully
- Google may show a CAPTCHA if you harvest many pages repeatedly in a short time

---

## Tips

- Run the harvest right after your search loads for best results
- If you only need the top results, set **Max pages** to `1` or `2` for a faster run
- The **Max links** cap is useful when searching broad queries — set it to `50` to grab just the top results without crawling all pages
- Use **Markdown** format when pasting into Notion, Obsidian, or any other Markdown-based tool
- The downloaded `.md` file groups links by page, making it easy to see which results came from deeper in the search

---

## License

MIT — free to use, modify, and distribute.
