<div align="center">

<img src="images/navigator128.png" alt="Navigator for Salesforce" width="96" height="96" />

# Navigator for Salesforce

### Navigate Salesforce Lightning faster than ever.

A keyboard-first Chrome extension that turns slow, click-heavy Salesforce navigation into instant, searchable jumps — Setup pages, objects, records, favorites, and orgs, all a shortcut away.

<p>
  <img src="https://img.shields.io/badge/version-5.0.0-0b5cab.svg" alt="Version" />
  <img src="https://img.shields.io/badge/Manifest-V3-1b73e8.svg" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Chrome-Extension-f59e0b.svg?logo=googlechrome&logoColor=white" alt="Chrome Extension" />
  <img src="https://img.shields.io/badge/JavaScript-vanilla-f7df1e.svg?logo=javascript&logoColor=black" alt="Vanilla JS" />
  <img src="https://img.shields.io/badge/dependencies-none-success.svg" alt="No dependencies" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://github.com/shawon39/navigator-for-salesforce/actions/workflows/test.yml"><img src="https://github.com/shawon39/navigator-for-salesforce/actions/workflows/test.yml/badge.svg" alt="Tests" /></a>
</p>

</div>

---

## Overview

**Navigator for Salesforce** is a lightweight browser extension for Salesforce admins, developers, and power users who live inside Lightning Experience and Setup all day. Instead of digging through menus, you get a fast popup launcher and an in-page **command palette** that fuzzy-search across everything you navigate to — with optional **live access to your org's objects and records**.

It runs entirely in your browser, has **zero dependencies and no build step**, and never sends your data to any third-party server.

## Features

### Command Palette — `Alt + K`
A Spotlight-style overlay that opens right on top of any Salesforce page.
- Grouped, ranked **fuzzy search** across Recent, Bookmarks, Setup Tabs, Records, Objects, and 400+ **Setup pages** (every standard Setup destination, categorized).
- **Live org search** — looks up real objects, records, **Flows, Profiles, Permission Sets, and your Lightning apps** straight from your org (toggleable).
- **Paste a record Id** (15- or 18-char) to jump straight to that record.
- **Command verbs** — type `new`, `list`, or `fields` followed by an object name to jump straight to its **New** record screen, **list view**, or **Fields & Relationships**; type `fields account`, press `Tab`, then type a field name (e.g. `fields account indus`) to open that **field's Setup page**; type `app` to list your apps in App Launcher order; type `record` on any open record to inspect its raw field values inline. Clickable verb chips on the empty board teach the syntax, and `Tab` locks the active verb.
- **Inline actions** — press `→` (or click `⋯`) on any result to expand quick actions: objects offer **List**, **New**, and **Fields & Relationships**; users offer **Login as** (new tab or Incognito), **Copy User Id**, and **Manage in Setup**.
- An **overview board** when the palette is empty — Recent Setup and Recent Records on the left, Bookmarks and Setup Tabs on the right.
- Fully keyboard driven, theme-aware (light/dark), and rendered in an isolated Shadow DOM so it never clashes with Lightning's styles.

### Navigator Popup — `Alt + N`
A compact, tabbed control center for the active org.
- **Current org** in the header, with a colored dot for its type (Production, Sandbox, Scratch, Developer, Trailhead). Click it to open the Orgs tab.
- **Orgs** — save your orgs once, then launch any one in a click; with a live session you land straight in, otherwise its login page opens. Pin, rename, and remove orgs inline. Only names and hosts are stored.
- **Recent** — your recently visited **Setup pages** and recently viewed **records**, in two sections.
- **Navigate** — one-click links to Home, Setup, Developer Console, Object Manager, Flows, Change Sets, Users, and your custom bookmarks.
- **Search** — one box for Setup pages, objects, bookmarks, and recent records; arrow keys to move, `Enter` to open, `Ctrl/⌘ + Enter` for a new tab.
- **Objects** — a searchable object list with quick actions for **List**, **New**, and **Fields**, plus a kebab menu for deeper Object Manager destinations (Page Layouts, Record Types, Validation Rules, Triggers, and more). **Pin** any object to float it to the top, and show **managed-package objects** from Settings.

### Bookmarks & Favorites
- Bookmark the current tab in one click, rename inline, reorder by drag-and-drop, and delete (up to 10).
- Pin favorite **Setup tabs** directly into the Salesforce Setup header for instant access.

### In-Page Enhancements
- Adds a customizable **quick-tabs bar** on Setup pages — add, edit, reorder, and remove your most-used destinations.
- Adds a **Navigator button** (N) as the first icon in Salesforce's top-right header; it opens the popup (Chrome 127+). Turn it off in Settings.

### Settings & Data
- A full **Settings page** (gear icon in the popup, or the extension's Options).
- **Theme**: Light, Dark, or System.
- Show or hide each **popup tab**; turn the **command palette**, **Setup quick tabs**, and **live org data** on or off.
- **Auto-close after navigation**, **ask before removing**, and **managed-package objects** toggles.
- Rename orgs, see your **keyboard shortcuts**, **Import / Export** bookmarks, quick tabs, orgs, and settings as JSON, plus **Reset settings** and **Clear all data**.

## Keyboard Shortcuts

| Windows / Linux | Mac | Action |
| --- | --- | --- |
| `Alt + N` | `⌥ E` | Open the Navigator popup |
| `Alt + S` | `⌥ S` | Jump straight to Setup |
| `Alt + H` | `⌥ L` | Jump straight to Home |
| `Alt + K` | `⌥ K` | Open the in-page command palette |

Chrome skips a default shortcut if Chrome or another extension already uses it. Change or set them at `chrome://extensions/shortcuts` (Navigator's Settings page links there).

**Inside the command palette:**

| Key | Action |
| --- | --- |
| `↑` / `↓` | Move between results |
| `→` / `←` | Expand / collapse a result's actions |
| `Tab` | Lock the typed command verb (e.g. `new` → New) |
| `Enter` | Open in the current tab |
| `⌘` / `Ctrl` + `Enter` | Open in a new tab |
| `Esc` | Collapse the open actions, or close the palette |

> Shortcuts can be customized at `chrome://extensions/shortcuts`.

## Installation

### From source (developer mode)

```bash
git clone https://github.com/shawon39/navigator-for-salesforce.git
```

1. Open `chrome://extensions` in Chrome (or any Chromium-based browser).
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select the cloned `navigator-for-salesforce` folder.
4. Pin the extension and open any Salesforce page — you're ready to go.

> _Chrome Web Store listing: coming soon._

## Usage

1. Open any **Salesforce Lightning** or **Setup** page.
2. Press `Alt + K` (`⌥ K` on Mac) to open the command palette and start typing — pages, objects, fields, records and apps show up as you type.
3. Press `Alt + N` (`⌥ E` on Mac) for the popup to switch orgs, manage bookmarks, or browse objects.
4. Use `Alt + S` / `Alt + H` (`⌥ S` / `⌥ L` on Mac) to jump to Setup or to the current app's Home.

## Permissions & Privacy

This extension is **privacy-first**. Everything happens locally in your browser, and your data is never transmitted to any third party.

| Permission | Why it's needed |
| --- | --- |
| `storage` | Save your bookmarks, Setup quick tabs, saved orgs and settings (synced via `chrome.storage`). |
| `cookies` | Read your existing Salesforce session cookie to make **read-only API calls to your own org** for live object, field, record and app lookups. |
| Host permissions | `https://*.force.com`, `https://*.my.salesforce.com` and `https://*.my.salesforce-setup.com` only. The extension doesn't run anywhere else. |

It doesn't ask for the `tabs` permission or any access to your browsing history.

When **live org access** is enabled, the extension reuses your active Salesforce session token to query the org's REST/SOSL APIs directly — the same approach popular tools like Salesforce Inspector use. The token is used **only** for requests to your own org and is never stored or sent elsewhere. You can disable live access anytime in **Settings**.

Full details: [Privacy policy](PRIVACY.md). Found a security problem? See [SECURITY.md](SECURITY.md).

## Project Structure

```
navigator-for-salesforce/
├── manifest.json              # MV3 manifest (entry points, permissions, shortcuts)
├── package.json               # Test and package scripts (no dependencies)
├── PRIVACY.md                 # Privacy policy (linked from the Chrome Web Store)
├── CHANGELOG.md · CONTRIBUTING.md · SECURITY.md · LICENSE · THIRD_PARTY_NOTICES.md
├── tests/                     # Node tests: background worker, search ranking, manifest checks
├── .github/                   # CI workflow, issue and pull request templates
├── store/                     # Chrome Web Store assets, one folder per version
│   ├── package.sh             # Builds store/v<version>/navigator-for-salesforce-<version>.zip
│   └── v5.0.0/                # Listing text, screenshots, promo tiles, store icon, zip
├── popup.html                 # Navigator popup markup
├── settings.html              # Settings (options) page
├── images/                    # Extension icons
├── fonts/                     # Bundled Figtree + JetBrains Mono (OFL)
├── styles/
│   ├── tokens.css             # Design tokens (light/dark) + font faces
│   ├── styles.css             # Popup styles
│   ├── settings.css           # Settings page styles
│   └── setupStyle.css         # In-page (content script) styles
└── src/
    ├── background/
    │   └── background.js       # Service worker: shortcuts + authenticated org API (search, admin metadata, login-as)
    ├── settings/
    │   └── settingsPage.js     # Settings page logic, import/export
    ├── shared/
    │   ├── sfUrl.js            # Salesforce URL checks, safe paths, search ranking
    │   ├── settings.js         # Settings defaults, theme resolution, font loading
    │   ├── themeBoot.js        # Applies the last theme before first paint (no flash)
    │   ├── orgs.js             # Org names and types (popup + Settings)
    │   ├── setupPages.js       # Master Setup-page catalog (shared by palette + popup)
    │   └── recents.js          # Recent-Setup tracking (shared by palette + popup)
    ├── content/
    │   ├── contentSetup.js     # Custom quick-tabs bar on Setup pages
    │   ├── headerButton.js     # Navigator (N) button in the Lightning header
    │   ├── commandPalette.data.js   # Catalog, icons & pure helpers
    │   └── commandPalette.js        # Command palette UI + logic
    └── popup/
        ├── popup.js            # Popup bootstrap + Salesforce detection
        ├── event.js            # Main navigation wiring
        ├── ui.js               # Icons, toast, inline confirm
        ├── logins.js           # Orgs tab: saved org launcher
        ├── bookmarks.js        # Bookmark CRUD + drag-and-drop
        ├── popupCatalog.js     # Static catalog data for the popup
        └── popupUI.js          # Tabs, search, objects (pin + menu), header org switcher
```

## Tests

```bash
npm test
```

Needs Node.js 18+ and nothing else. The tests run on every push and pull request.

## Publishing

1. Bump `version` in `manifest.json` and `package.json`.
2. Run `npm run package` to build the upload zip in `store/v<version>/`.
3. Upload the zip in the Chrome Web Store dashboard, and copy the listing text and images from `store/v<version>/` (see `listing.md` there).

## Tech Stack

- **Vanilla JavaScript** — no frameworks, no bundler, no dependencies.
- **Chrome Manifest V3** — service worker background, content scripts, and a popup action.
- **Shadow DOM** for the command palette to keep styles fully isolated.

There's no build step: the repository is the extension. Edit a file, reload the extension at `chrome://extensions`, and refresh your Salesforce tab.

## Contributing

Contributions, ideas, and bug reports are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to run it locally, the tests, and the code style.

## License

Released under the [MIT License](LICENSE). Icons and fonts are credited in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Navigator for Salesforce is an independent project and is not affiliated with or endorsed by Salesforce, Inc. Salesforce and Lightning are trademarks of Salesforce, Inc.

## Author

**Shakhawat Hossain**

- GitHub — [@shawon39](https://github.com/shawon39)
- LinkedIn — [shawon39](https://www.linkedin.com/in/shawon39)

---

<div align="center">

If this extension speeds up your Salesforce workflow, consider giving it a star on GitHub.

</div>
