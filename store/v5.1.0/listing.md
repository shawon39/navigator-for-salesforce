# Chrome Web Store update — v5.1.0

A feature update: tab colors by org, Apex and custom metadata type search, switching between orgs, and package objects in search. In the dashboard, the package, the description and three privacy justifications change. Everything else stays as submitted for [v5.0.0](../v5.0.0/listing.md) and [v5.0.1](../v5.0.1/listing.md).

**Before you submit:** merge the release into `main`. The privacy policy link points at `main/PRIVACY.md`, and this release adds Apex, custom metadata types and tab colors to it.

## Package tab

Upload `navigator-for-salesforce-5.1.0.zip` from this folder. No permissions change, so users get no new permission prompt.

## Store listing tab

Replace the **Description** with `description.txt` from this folder (plain text, paste as is). It adds Apex and custom metadata type search, the `org` command, opening the same page in another org, and tab colors.

The name, summary, screenshots, promo tiles and icon stay as they are in `../v5.0.0/`.

## Privacy practices tab

Replace these three justifications. Leave the single purpose, remote code, data usage and certifications as they are.

storage:

```
Saves the user's settings, bookmarks, Setup quick tabs, pinned objects and saved orgs (with each org's tab color), and syncs them through the user's own Chrome profile.
```

cookies:

```
Reads the Salesforce session cookie for the org the user is already logged in to, so the extension can search that org's objects, fields, records, apps, Apex classes and triggers, and custom metadata types through the Salesforce REST API on the user's behalf. The requests only read data. The cookie is only used for requests to that same Salesforce org and is never stored or sent anywhere else. It also checks which Salesforce domains have a session cookie, so the Orgs tab can offer to add orgs that are open in the browser; only the domain names are used, and they stay in the browser.
```

Host permissions (https://*.force.com, https://*.my.salesforce.com, https://*.my.salesforce-setup.com):

```
Needed to show the command palette, the Setup quick tabs and the header button on Salesforce pages, to color a saved org's browser tab icon when the user turns that on, and to call the Salesforce REST API of the org the user is logged in to. The extension does not run on any other website.
```

Then click **Submit for review**.

## What's new in 5.1.0 (for the GitHub release)

- Tab colors by org (off by default): each saved org's tabs get a Salesforce cloud in its own color with its initial; production gets red first and its initial in a circle
- On an org you haven't saved, the popup's Orgs tab offers to add it and shows the color it will get
- Search finds Apex classes, Apex triggers (also by their object) and custom metadata types; `→` on a type offers Manage records
- `org` in the palette lists your saved orgs; `→` opens the page you're on in another org, and the popup's Orgs rows have the same **Open this page here**
- The popup's Objects tab finds objects from installed packages when you search, and package objects and fields rank after your own
- Apex from installed packages appears only when you type the package's name
