# Changelog

## Unreleased

### Added
- Peek: `→` on a record in the palette shows its key fields (the record's compact layout) beside the results, without leaving the page. The preview follows as you move through the list; a lookup in it opens that record. `←` or `Esc` closes it. Needs live org access.
- Recent work: with nothing typed, the palette lists the flows, Apex classes and triggers, permission sets, profiles and custom fields changed in the last 30 days, newest first. **You** shows your changes, **Everyone** shows everyone's and who made them; `Tab` switches. Changes made outside Navigator count too. Needs live org access.
- On a record, the palette lists the records it links to (its Account, Owner and other lookups on the page layout) and its related lists. Typing finds them too, so `acc` on an Opportunity offers its Account. Needs live org access.
- Admin shorthand in the palette and popup search: `ps`, `psg`, `dl`, `cmdt`, `cs`, `lwc`, `sr`, `aj`, `sj`, `vf`, `om`, `ip`, `nc`, `rss`, `lh`, `sat`, `ds`, `ics`, `ocs` and `lab` open Permission Sets, Permission Set Groups, Debug Logs and the other Setup pages they stand for.
- Text you select on the page fills the palette's search when you open it. A selection left on the page fills it only once.
- `Shift+Enter` (or `Shift`+click) opens a palette result in a background tab and keeps the palette open, to open several pages in a row.
- A pasted record Id shows the record's name and object before you open it.

### Changed
- Recent Setup also keeps the Setup pages you open by clicking through Setup, not only those opened with Navigator.

## 5.1.1

### Added
- Short forms of the palette commands: `f` (fields), `li` (list), `n` (new), `a` (app), `o` (org), `lo` (login) and `r` (record). `f acc` is the same as `fields acc`. The palette's start line shows each one.
- On a record or list, the palette starts with that object in Object Manager: `Alt+K` (`Option+K` on a Mac), then `Enter`, opens it, and `→` lists its other pages. With nothing typed after them, `fields`, `new` and `list` put that object first.
- `→` on an object now offers all of its Object Manager pages, as the popup's object menu does: Page Layouts, Lightning Record Pages, Record Types, Validation Rules, Triggers, Buttons, Links & Actions, Search Layouts and Object Access.
- Paste a Salesforce link from another org, such as a Setup page from a sandbox, to open the same page in this org. Links to a single record only open in their own org.
- Results you pick often rank higher, per org. They only move ahead of results that match about as well.
- If `Alt+K` (`Option+K`) has no Chrome shortcut, the palette says so and offers **Set it**, which opens Chrome's shortcut page. Extensions can't set the key themselves. Turn the reminder off with **Don't show again** or in **Settings → On Salesforce pages → Shortcut reminder**.

### Changed
- Navigator has a website: https://navigator-sf.netlify.app. Settings → About links to it, its Privacy link opens the policy there, and Chrome's extension details link to it as the homepage.

### Fixed
- `Alt+K` (`Option+K` on a Mac) opens the command palette in browsers that don't pass extension shortcuts on, such as Arc. There it works while focus is in the page itself, not inside an embedded Setup frame.
- Recent Setup is now kept per org. A Flow, Profile, Permission Set or field opened in one org (for example a UAT sandbox) no longer shows up in another org's Recent list, where its link fails. History saved by earlier versions is cleared once, because it doesn't say which org it came from.
- A Flow in Recent Setup now opens its current version. Before, it kept opening the version that was latest when you first opened it, and failed with "We can't open this flow" once that version was deleted. Needs live org access.

## 5.1.0

### Added
- Tab colors by org, off by default. Turn on **Settings → Orgs → Color browser tabs by org** and each saved org's tabs get a Salesforce cloud icon in the org's own color, with its initial in the middle, so you can tell orgs apart at a glance. Production orgs get red first and show the initial in a circle. Pick any of 12 colors per org in Settings; open tabs update right away. The popup and the palette show the same colors. Only saved orgs are colored: on an org you haven't saved, the popup's Orgs tab offers to add it and shows the color it will get.
- Search finds Apex classes, Apex triggers (also by their object) and custom metadata types by name and opens their Setup pages. On a custom metadata type, `→` offers **Manage records**. Apex from installed packages, whose code can't be opened, is left out unless you type the package's name (for example `dlrs selector`).
- `org` in the palette lists your saved orgs. `Enter` opens one in a new tab; `→` opens the page you're on in that org, to compare it with this one (not on pages about a single record, which wouldn't exist there).
- **Open this page here** on each row of the popup's Orgs tab does the same from the popup.

### Changed
- Searching the popup's Objects tab finds objects from installed packages even when **Show managed-package objects** is off; the list itself still hides them, and **Show them** under the list turns them on.
- Objects and fields from installed packages rank after your org's own when they match about as well, in search and in `fields`, `list` and `new`.

## 5.0.1

### Added
- Legacy Profiles in Setup search, for orgs that still use the old profile pages. Profiles keeps opening the enhanced profile pages.
- Sandboxes in Setup search.
- Settings → About links to the project, bug reports and the privacy policy.

### Fixed
- `login` and plain search now find users with common names. Before, Accounts, Contacts and Leads with the same name could crowd them out, and `login` said "No users match".
- Users can also be found by username or alias.
- `list contacts`, `new accounts`, `fields contacts` and other plural object names now find the right object when org data is loaded.

### Changed
- The release zip includes the license files, and the fonts ship with their full license text.

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

Published on the Chrome Web Store as Salesforce Easy Navigator. Those versions aren't in this repository.
