# Contributing

Thanks for helping make Salesforce navigation faster. Bug reports, ideas and pull requests are all welcome.

## Run it locally

There is no build step: the repository is the extension.

1. Clone the repo.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the repo folder.
3. Open a Salesforce org. A free [Developer Edition](https://developer.salesforce.com/signup) org works well for testing.
4. After a change, click **Reload** on the extension and refresh the Salesforce tab.

If you also installed Navigator from the Chrome Web Store, turn that copy off at `chrome://extensions` while you test, or both copies run on Salesforce pages. Chrome gives each shortcut to the copy installed first, so set the unpacked copy's shortcuts at `chrome://extensions/shortcuts`.

## Where things live

```
manifest.json      Entry points, permissions, shortcuts
popup.html         Toolbar popup markup (scripts in src/popup/)
settings.html      Settings page markup (scripts in src/settings/)
src/background/    Service worker: shortcuts and all Salesforce API calls (read-only)
src/content/       Runs on Salesforce pages: command palette, Setup quick tabs, header button
src/popup/         Toolbar popup
src/settings/      Settings page
src/shared/        Helpers used by more than one part, including the Setup page catalog
styles/            CSS for the popup, Settings and quick tabs. The palette's CSS is in commandPalette.data.js
                   Colors: tokens.css, with copies in setupStyle.css and commandPalette.data.js to keep in sync
tests/             Node tests, run with npm test
store/             Chrome Web Store listing text, images and release zips, one folder per version
```

## Tests

You need a current Node.js LTS release (20 or newer). There are no npm dependencies to install.

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
- Put Salesforce data in the page with `textContent`. Use `innerHTML` only for static markup, icons and search highlighting, and pass any text through `escapeHtml()`, `highlight()` or `markText()` first.
- All calls to Salesforce go through the background worker and must stay read-only.
- New settings go in `DEFAULTS` in `src/shared/settings.js` and get a switch on the Settings page.

## Pull requests

- Keep each pull request to one change, and describe what it does and how you tested it.
- Add or update a test in `tests/` when you change the background worker or search ranking.
- Update `CHANGELOG.md` under "Unreleased".

## Releasing (maintainers)

1. Update `version` in both `manifest.json` and `package.json`, and move the "Unreleased" notes in `CHANGELOG.md` under the new version.
2. Run `npm test`, then `npm run package` to build `store/v<version>/navigator-for-salesforce-<version>.zip`. It refuses to overwrite a zip that already exists.
3. Add a `listing.md` to `store/v<version>/` that says what changes in the store dashboard. Copy the listing text and images only when they change (see `store/v5.0.1/` for a package-only update). Then upload the zip in the Chrome Web Store dashboard.
4. If `PRIVACY.md` changed, update the same text on the website: `public/privacy/index.html` in the private `navigator-sf-site` repo. The store listing links to the website copy, so the two must match.
5. Commit, tag the commit `v<version>`, and create a GitHub release from the tag with the zip attached and the changelog notes.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
