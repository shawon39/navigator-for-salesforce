# Changelog

## Unreleased

## 5.0.0

A full redesign, plus new ways to search.

### Added
- App search: type an app name, or `app` to list all your apps in App Launcher order.
- Field search: `fields account indus` opens the Industry field's Setup page.
- Orgs tab: rename and pin orgs, colored dots for org type, "This tab" marker, add orgs that are open in the browser.
- N button in the Salesforce header that opens the popup (can be turned off).
- Home opens the current app's own start page, so apps without a Home tab don't get an extra Home tab.
- Full Settings page: theme (light, dark, system), popup tabs, features, org names, shortcuts, import and export.
- Record inspector: field labels, Copy Id and Copy JSON.
- "Log in as" mode in the command palette (`login jane`).

### Changed
- New look for the popup, command palette, Settings and Setup quick-tab dialogs.
- Search ranks exact and prefix matches first, so "users" finds Users.
- Same shortcuts on Windows and Mac (Alt on Windows, Option on Mac): N popup, K palette, S Setup, A Home. Users can change them at chrome://extensions/shortcuts.

### Security
- The background worker only accepts messages from the extension itself, for Salesforce hosts, and only for the org of the page that asks.
- "Log in as" validates the user Id and target page.
- Host permissions are https only, and the `tabs` permission is no longer needed.
- Page scripts can't read or drive the command palette or the quick-tab buttons (closed Shadow DOM, real clicks and keys only).
- Saved orgs can only point at Salesforce domains, so an imported file can't add a look-alike login page.
- Import shows what it will replace, with counts, and never empties a list because of a broken file.
- Imported settings keep only known options with the right type.
- Quick-tab edits re-read the saved list first, so changes from another tab or device aren't lost.
- Stricter checks on host names, record Ids and object names before any API call, and on encoded slashes in paths.
- "Clear all data" says it clears every synced device.

### Fixed
- Installing on a second computer no longer overwrites synced settings.
- Failed saves now show an error instead of looking saved.
- "Close the popup after opening a page" now applies everywhere.

## 4.x and earlier

See the git history.
