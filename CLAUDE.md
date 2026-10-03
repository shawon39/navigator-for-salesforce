# CLAUDE.md

Notes for AI coding assistants working in this repository. People should read [CONTRIBUTING.md](CONTRIBUTING.md), which has the same rules in more detail.

## The project

Navigator for Salesforce is a Manifest V3 Chrome extension, published on the Chrome Web Store. It's plain JavaScript with no framework, no bundler and no npm dependencies. There's no build step: the repository is the extension.

- `src/background/background.js` is the service worker. Every Salesforce API call goes through it.
- `src/content/` runs on Salesforce pages: the command palette, Setup quick tabs and the header button.
- `src/popup/` and `src/settings/` hold the scripts for `popup.html` and `settings.html`.
- `src/shared/setupPages.js` is the Setup page catalog used by both the palette and the popup.

## Rules

- Salesforce API calls must stay read-only, and must only go to the org of the page that asked.
- Put Salesforce data in the page with `textContent`. Use `innerHTML` only for static markup, icons and search highlighting, after escaping.
- Match the surrounding style: an IIFE with `"use strict"` per file, 4-space indent, double quotes, and short comments that explain why.
- New settings go in `DEFAULTS` in `src/shared/settings.js` and get a switch on the Settings page.
- Keep changes small and focused. Don't refactor or reformat code you weren't asked to touch.

## Checking your work

- Run `npm test` (Node.js 20 or newer). Add or update a test in `tests/` when you change the background worker or search ranking.
- Add a line to `CHANGELOG.md` under "Unreleased" for anything a user would notice.
- UI changes need a manual check: load the folder unpacked at `chrome://extensions` and try it on a Salesforce org.
