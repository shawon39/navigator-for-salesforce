# Contributing

Thanks for helping make Salesforce navigation faster. Bug reports, ideas and pull requests are all welcome.

## Run it locally

There is no build step: the repository is the extension.

1. Clone the repo.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the repo folder.
3. Open a Salesforce org. A free [Developer Edition](https://developer.salesforce.com/signup) org works well for testing.
4. After a change, click **Reload** on the extension and refresh the Salesforce tab.

## Tests

You need Node.js 18 or newer. There are no npm dependencies to install.

```bash
npm test
```

This checks that every script parses and every file in the manifest exists, runs the background worker's security and API tests with a stubbed `chrome` API, and checks search ranking. The same tests run on every push and pull request.

UI changes can't be fully covered by these tests, so please also try your change by hand:

- the popup on a Salesforce tab and on a non-Salesforce tab
- the command palette (`Alt+K` / `Option+K`) in light and dark theme
- a Setup page (quick tabs) and a Lightning page (header N button)

## Code style

- Plain JavaScript, no frameworks, no bundler, no dependencies.
- Each file is wrapped in an IIFE with `"use strict"`. Shared helpers live in `src/shared/` and are exposed on `window.SFEN_*`.
- 4-space indent, double quotes, and short comments that explain *why*.
- Build DOM from Salesforce data with `textContent`, never `innerHTML`.
- All calls to Salesforce go through the background worker and must stay read-only.
- New settings go in `DEFAULTS` in `src/shared/settings.js` and get a switch on the Settings page.

## Pull requests

- Keep each pull request to one change, and describe what it does and how you tested it.
- Add or update a test in `tests/` when you change the background worker or search ranking.
- Update `CHANGELOG.md` under "Unreleased".

## Releasing (maintainers)

1. Update `version` in both `manifest.json` and `package.json`, and move the "Unreleased" notes in `CHANGELOG.md` under the new version.
2. Run `npm test`, then `npm run package` to build `store/v<version>/navigator-for-salesforce-<version>.zip`.
3. Upload the zip in the Chrome Web Store dashboard. Listing text and images live in `store/v<version>/`.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
