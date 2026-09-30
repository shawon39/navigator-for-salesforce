# Security Policy

Navigator for Salesforce reads the Salesforce session cookie of the org you are logged in to, so it can call that org's API on your behalf. Security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Include:

- what an attacker could do, and under which conditions
- steps to reproduce (a small proof of concept helps)
- the extension version (see `chrome://extensions`)

Never include real session IDs, access tokens or data from a production org.

You should get a first reply within a week. Fixes are released as a new version on the Chrome Web Store, and the report is credited in the changelog unless you prefer otherwise.

## Supported versions

Only the latest released version gets security fixes.

## What is in scope

- Anything that could leak a Salesforce session or token outside the user's own org
- Content-script issues on Salesforce pages (injection, breaking out of the extension's UI)
- Messages to the background worker that bypass its sender and host checks
