// orgs.js
// Shared helpers for saved orgs (chrome.storage.sync "quickOrgs", entries
// { id, label, host, isSandbox, pinned }). Used by the popup's Orgs tab, the
// Settings page and the content scripts. An empty label means "use the
// cleaned-up My Domain name".
(function () {
    "use strict";

    const TYPES = {
        production: "Production",
        sandbox: "Sandbox",
        scratch: "Scratch",
        developer: "Developer",
        trailhead: "Trailhead",
    };

    // "acme--uat.sandbox.lightning.force.com" -> "acme--uat.sandbox"
    // Visualforce hosts end in "--<namespace>": "acme--c.vf.force.com" -> "acme",
    // "acme--uat--c.sandbox.vf.force.com" -> "acme--uat.sandbox". Lowercase, so
    // an org saved as "Acme.my.salesforce.com" matches its tabs.
    function shortHost(host) {
        return (host || "")
            .toLowerCase()
            .replace(/--[A-Za-z0-9_]+((?:\.[a-z]+)?)\.vf\.force\.com$/i, "$1")
            .replace(/\.(my\.salesforce|lightning\.force|my\.salesforce-setup)\.com$/, "")
            .replace(/\.my\.site\.com$/, "");
    }

    function orgType(org) {
        const h = shortHost(org.host);
        if (/\.scratch$/.test(h)) return "scratch";
        if (/\.trailblaze$/.test(h)) return "trailhead";
        if (/\.develop$/.test(h) || /-dev-ed$/.test(h)) return "developer";
        if (org.isSandbox || /--/.test(h) || /\.sandbox$/.test(h)) return "sandbox";
        return "production";
    }

    const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

    // "acme--uat.sandbox" -> "Acme · UAT"; "orgfarm-3f9a-dev-ed.develop" -> "Orgfarm-3f9a"
    function defaultName(host) {
        const first = shortHost(host).split(".")[0];
        const [base, box] = first.split("--");
        const name = cap(base.replace(/-dev-ed$/, ""));
        if (!box) return name;
        return `${name} · ${box.length <= 3 ? box.toUpperCase() : cap(box)}`;
    }

    // Older saves stored the raw host as the label; treat that as unnamed too.
    function displayName(org) {
        const label = (org.label || "").trim();
        if (!label || label === org.host || label === shortHost(org.host)) return defaultName(org.host);
        return label;
    }

    // An org's My Domain host, which Salesforce redirects to the right domain
    // for any path (Lightning, Setup, Visualforce), through login if needed.
    // The Setup domain itself answers "Insufficient Privileges" when opened
    // directly. null for hosts that aren't an org's own (sites, login).
    function myDomainHost(host) {
        const h = String(host || "").toLowerCase();
        const vf = h.match(/^(.+)--[a-z0-9_]+(\.[a-z]+)?\.vf\.force\.com$/);
        if (vf) return vf[1] + (vf[2] || "") + ".my.salesforce.com";
        const m = h.match(/^([a-z0-9-]+(?:\.[a-z]+)?)\.(my\.salesforce|lightning\.force|my\.salesforce-setup)\.com$/);
        return m ? m[1] + ".my.salesforce.com" : null;
    }

    // The page at `href` (path and query) in a saved org, to compare the same
    // Setup page or list across orgs. The hash is dropped: login loses it.
    // null when the org or the path can't be used.
    function samePageUrl(org, href) {
        let u;
        try {
            u = new URL(href);
        } catch (e) {
            return null;
        }
        const path = u.pathname + u.search;
        const host = String((org && org.host) || "").toLowerCase();
        if (!window.SFEN_URL.isSafePath(path) || !window.SFEN_URL.isOrgHost(host)) return null;
        if (/^(login|test)\.salesforce\.com$/.test(host)) return `https://${host}/?startURL=${encodeURIComponent(path)}`;
        const my = myDomainHost(host);
        return my ? "https://" + my + path : null;
    }

    window.SFEN_ORGS = { TYPES, shortHost, orgType, defaultName, displayName, myDomainHost, samePageUrl };
})();
