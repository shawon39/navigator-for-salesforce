# Privacy Policy — Navigator for Salesforce

Last updated: 3 October 2026

Navigator for Salesforce is a browser extension that helps you move around Salesforce faster. This page explains what it touches and what it does not.

## What the extension uses

- **Your Salesforce session.** When you open the command palette or popup, search, or go Home, the extension reads the session cookie of the Salesforce org you are already logged in to. It uses that session only to send read-only requests to that same org's Salesforce API, for example to list objects, fields, records, users, apps, flows, profiles, permission sets, Apex classes and triggers, and custom metadata types. The cookie is not saved by the extension and is never sent anywhere else. When you use "Login as" in Incognito, the session is passed in the link to that same org's `frontdoor.jsp` page, because that is the only way to carry it into a private window. The link stays in that window's history until you close the window.
- **Which orgs you are logged in to.** When you open the popup, the extension checks which Salesforce domains have a session cookie, so the Orgs tab can offer to add orgs that are open in your browser. Only the domain names are used, and they stay in your browser.
- **Your settings and saved items.** Settings, bookmarks, Setup quick tabs, pinned objects and saved orgs (a name you choose, the org's web address and its tab color) are stored with Chrome's storage and synced through your own Chrome profile.
- **Recent Setup pages.** A short list of Setup pages you opened is kept in your browser's local storage so they can be shown under "Recent".

## What the extension does not do

- It does not send any data to the developer or to any third party.
- It has no analytics, tracking, ads or accounts.
- It does not run on websites other than Salesforce.
- It does not create, change or delete anything in your Salesforce org. All its Salesforce requests only read data.
- It does not sell or share your data, and does not use it for any purpose other than the navigation features described above.

## Controlling your data

- Turn off **Load data from your org** in Settings to stop all Salesforce API requests.
- Use **Settings → Data → Clear all data** to delete everything the extension has stored.
- Removing the extension from Chrome deletes its data from your browser.

## Contact

Questions or concerns: https://github.com/shawon39/navigator-for-salesforce/issues

Navigator for Salesforce is an independent project and is not affiliated with or endorsed by Salesforce, Inc.
