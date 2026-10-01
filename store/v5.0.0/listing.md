# Chrome Web Store listing — v5.0.0

Copy each block into the matching field of the Chrome Web Store developer dashboard.

## Store listing tab

**Name** (from manifest.json, 24/75 characters)

```
Navigator for Salesforce
```

**Summary** (from manifest.json, 86/132 characters)

```
Open any Salesforce Setup page, object, field, record, app or org in a few keystrokes.
```

**Category:** Developer Tools
**Language:** English

**Description** (same text as `description.txt` in this folder, plain text, paste as is)

```
I built Navigator because I was tired of clicking through Setup to reach the same twenty pages every day. It puts a search box on top of Salesforce so you can get anywhere by typing a few letters.

Press Alt+K (Option+K on a Mac) on any Salesforce page and start typing:

- "users" opens Users, "perm" finds Permission Sets
- "acme" finds the Acme account you looked at yesterday
- "app service" opens the Service Console app
- "fields account indus" takes you straight to the Industry field on Account
- "new case", "list contacts" and "fields opportunity" do exactly what they say
- "record" on any record page shows its field values, with API names, ready to copy
- "login jane" logs you in as Jane (when you have permission to)

Results are ranked by how well the name matches, so the page you meant comes first.

The toolbar popup (Alt+N, or Option+N on a Mac) has four tabs:

- Recent: Setup pages you opened and records you viewed
- Navigate: Home, Setup, Object Manager, Dev Console, Flows, Users, change sets, plus up to 10 bookmarks
- Objects: every object with one-click list, new record and fields, and a menu for layouts, record types, validation rules and triggers
- Orgs: your saved orgs with a colored dot for production, sandbox, scratch and developer orgs. Rename them, pin the ones you use most, and open any of them in one click

A few more things it does:

- Adds a row of your own Setup quick tabs under the Setup header
- Adds an N button to the Salesforce header that opens the popup
- Home takes you to the current app's own start page, so apps without a Home tab stay tidy
- Alt+S goes to Setup and Alt+A goes to Home (Option+S and Option+A on a Mac). You can change any shortcut at chrome://extensions/shortcuts
- Light, dark or system theme
- Everything can be switched on or off in Settings

Privacy

Navigator runs entirely in your browser. It talks only to the Salesforce org you are logged in to, using the session you already have, and it never sends your data anywhere else. There are no analytics, no ads and no accounts. Your bookmarks, orgs and settings sync through your own Chrome profile.

Navigator is an independent project and is not affiliated with or endorsed by Salesforce, Inc.

Questions or ideas: https://github.com/shawon39/navigator-for-salesforce/issues
```

**Graphic assets** (all in this folder)

| Field | File | Size |
|---|---|---|
| Store icon | `icon/store-icon-128.png` | 128×128 (96×96 artwork, 16 px padding) |
| Screenshots (up to 5) | `screenshots/01-…png` to `05-…png` | 1280×800 each |
| Small promo tile | `promo/small-tile-440x280.png` | 440×280 |
| Marquee promo tile | `promo/marquee-1400x560.png` | 1400×560 |

**Official URL:** none
**Homepage URL:** https://github.com/shawon39/navigator-for-salesforce
**Support URL:** https://github.com/shawon39/navigator-for-salesforce/issues

## Privacy practices tab

**Single purpose**

```
Navigator helps Salesforce users move around Salesforce faster: it searches Setup pages, objects, fields, records, apps and saved orgs, and opens the one the user picks.
```

**Permission justifications**

storage:
```
Saves the user's settings, bookmarks, Setup quick tabs, pinned objects and saved orgs, and syncs them through the user's own Chrome profile.
```

cookies:
```
Reads the Salesforce session cookie for the org the user is already logged in to, so the extension can search that org's objects, fields, records and apps through the Salesforce REST API on the user's behalf. The cookie is only used for requests to that same Salesforce org and is never stored or sent anywhere else.
```

Host permissions (https://*.force.com, https://*.my.salesforce.com, https://*.my.salesforce-setup.com):
```
Needed to show the command palette, the Setup quick tabs and the header button on Salesforce pages, and to call the Salesforce REST API of the org the user is logged in to. The extension does not run on any other website.
```

**Remote code:** No, I am not using remote code. (All scripts, styles and fonts are packaged in the extension.)

**Data usage** — tick:

- [x] Authentication information (the Salesforce session cookie, used only to call the user's own org)

Leave every other data type unticked. Then certify all three statements:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

```
https://github.com/shawon39/navigator-for-salesforce/blob/main/PRIVACY.md
```

## Distribution tab

- Visibility: Public
- Regions: All regions

## What's new in 5.0.0 (for the GitHub release or a changelog)

- New look for the popup, command palette and Settings, with light and dark themes
- App search: "app sales" or just "sales" opens the app
- Field search: "fields account indus" opens the Industry field
- Better ranking: "users" now finds Users first
- Orgs tab: rename, pin, org type colors and "This tab"
- N button in the Salesforce header opens the popup
- Home opens the current app's own start page
- Full Settings page: tabs, features, orgs, shortcuts, import and export
- Safer and lighter: https-only, no "tabs" permission, stricter checks on every request
