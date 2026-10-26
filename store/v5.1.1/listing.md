# Chrome Web Store update — v5.1.1

A bug-fix update that also links the website and moves the privacy policy link to it. No permissions change, so users get no new permission prompt. The description, screenshots, promo tiles, icon and privacy justifications stay as they are in [v5.1.0](../v5.1.0/listing.md).

## Before you start

Merge the website's privacy update (shawon39/navigator-sf-site#1) and check that https://navigator-sf.netlify.app/privacy/ says "Last updated: 26 October 2026". The listing links to that page from this version on, and it must describe 5.1.1 (Recent Setup now keeps each page's org).

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

- `Alt+K` (`Option+K` on a Mac) opens the command palette in browsers that don't pass extension shortcuts on, such as Arc
- Recent Setup is kept per org, so a page opened in a sandbox no longer shows up in production's Recent list
- A Flow in Recent Setup opens its current version
- Settings → About links to the new website, and its Privacy link opens the policy there
