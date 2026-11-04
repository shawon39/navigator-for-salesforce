# Chrome Web Store update: v5.2.0

A feature update: record previews, list views, record counts, recent records, Org Limits and Setup commands in the palette, and a redesign of the palette, popup and Settings. No permissions change, so users get no new permission prompt. The screenshots, promo tiles and icon stay as they are in [v5.0.0](../v5.0.0/listing.md); the URLs stay as set for [v5.1.1](../v5.1.1/listing.md).

## Before you start

Merge the website's privacy update and check that https://navigator-sf.netlify.app/privacy/ says "Last updated: 4 November 2026" and has "Text you select". The listing links to that page, and it must describe 5.2.0 (record previews, selected text and Setup pages reached by clicking through Setup).

## Package tab

Upload `navigator-for-salesforce-5.2.0.zip` from this folder.

## Store listing tab

Replace the **Description** with `description.txt` from this folder (plain text, paste as is). It adds the new palette commands and the preview, and the Navigate tab's new shortcuts and 25 bookmarks.

## Privacy practices tab

Replace the cookies justification, which now names the new reads. Leave the others as they are in [v5.1.0](../v5.1.0/listing.md).

cookies:

```
Reads the Salesforce session cookie for the org the user is already logged in to, so the extension can search that org's objects, fields, records, users, apps, flows, profiles, permission sets, Apex classes and triggers, custom metadata types and list views, preview a record's key fields, count records and show the org's limits, through the Salesforce REST API on the user's behalf. The requests only read data. The cookie is only used for requests to that same Salesforce org and is never stored or sent anywhere else. It also checks which Salesforce domains have a session cookie, so the Orgs tab can offer to add orgs that are open in the browser; only the domain names are used, and they stay in the browser.
```

Then click **Submit for review**.

## What's new in 5.2.0 (for the GitHub release)

- Peek: `→` on a record in the palette shows its key fields beside the results; on a user, their details with Login as
- `list account ` lists Account list views; `list account 1` to `5` opens an Account you viewed lately
- `count lead` shows how many Leads there are, by record type
- `recent` lists the records you viewed last; `recent account` only Accounts
- `limits` shows how much of each org limit is used, most used first
- `flows`, `profiles`, `permsets`, `apex` and `users` list them, last modified first; type to narrow
- On a record, the palette lists the records it links to, like its Account and Owner
- Admin shorthand: `ps`, `psg`, `dl`, `cmdt` and others open the Setup page they stand for
- Selected text fills the palette's search, `Shift+Enter` opens a result in a background tab, and a pasted record Id shows its name
- A new look for the palette, popup and Settings: colored tiles by kind of result, the org's type as a tag, and keys shown as keys
- The popup's Recent tab shows records and Setup pages side by side; the Navigate tab has five shortcuts and up to 25 bookmarks
- A new custom object no longer stays missing from search for hours
