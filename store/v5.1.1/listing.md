# Chrome Web Store update — v5.1.1

A feature and bug-fix update that also links the website and moves the privacy policy link to it. No permissions change, so users get no new permission prompt. The description, screenshots, promo tiles, icon and privacy justifications stay as they are in [v5.1.0](../v5.1.0/listing.md).

## Before you start

Merge the website's privacy update (shawon39/navigator-sf-site#2) and check that https://navigator-sf.netlify.app/privacy/ has "What you pick in the command palette". The listing links to that page from this version on, and it must describe 5.1.1 (Recent Setup keeps each page's org, and palette picks are counted per org).

## Package tab

Upload `navigator-for-salesforce-5.1.1.zip` from this folder.

## Store listing tab

- **Official URL:** `https://navigator-sf.netlify.app/` (pick it from the drop-down; it's verified in Google Search Console). It shows under the extension name.
- **Homepage URL:** `https://navigator-sf.netlify.app/`
- **Support URL:** `https://github.com/shawon39/navigator-for-salesforce/issues`

## Privacy practices tab

- **Privacy policy URL:** `https://navigator-sf.netlify.app/privacy/`

Leave the justifications unchanged. Then click **Submit for review**.

## What's new in 5.1.1 (for the GitHub release)

- Short forms of the palette commands: `f` fields, `li` list, `n` new, `a` app, `o` org, `lo` login, `r` record
- On a record or list, the palette starts with that object in Object Manager, and `fields`, `new` and `list` put it first
- `→` on an object offers all of its Object Manager pages: layouts, record pages, record types, validation rules, triggers and more
- Paste a Salesforce link from another org to open the same page in this one
- Results you pick often rank higher, per org
- If `Alt+K` (`Option+K`) has no Chrome shortcut, the palette says so and opens Chrome's shortcut page to set it
- `Alt+K` (`Option+K` on a Mac) opens the command palette in browsers that don't pass extension shortcuts on, such as Arc
- Recent Setup is kept per org, so a page opened in a sandbox no longer shows up in production's Recent list
- A Flow in Recent Setup opens its current version
- Settings → About links to the new website, and its Privacy link opens the policy there
