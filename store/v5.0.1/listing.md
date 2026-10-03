# Chrome Web Store update — v5.0.1

A bug-fix update. Only the package and one privacy answer change. Everything else stays as submitted for [v5.0.0](../v5.0.0/listing.md).

## Package tab

Upload `navigator-for-salesforce-5.0.1.zip` from this folder.

## Store listing tab

No changes. The description, screenshots, promo tiles and icon stay as they are in `../v5.0.0/`. The description's `"list contacts"` example works from this version on.

## Privacy practices tab

Replace the **cookies** justification with:

```
Reads the Salesforce session cookie for the org the user is already logged in to, so the extension can search that org's objects, fields, records and apps through the Salesforce REST API on the user's behalf. The cookie is only used for requests to that same Salesforce org and is never stored or sent anywhere else. It also checks which Salesforce domains have a session cookie, so the Orgs tab can offer to add orgs that are open in the browser; only the domain names are used, and they stay in the browser.
```

Leave the other answers unchanged. Then click **Submit for review**.

## What's new in 5.0.1 (for the GitHub release)

- `login` and plain search find users with common names, and by username or alias
- `list contacts`, `new accounts` and `fields contacts` find the right object
- Legacy Profiles and Sandboxes in Setup search
- Settings → About links to the project, bug reports and the privacy policy
- The package includes the license files
