// orgs.js
// Shared helpers for saved orgs (chrome.storage.sync "quickOrgs", entries
// { id, label, host, isSandbox, pinned }). Used by the popup's Orgs tab and the
// Settings page. An empty label means "use the cleaned-up My Domain name".
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
    // "acme--uat--c.sandbox.vf.force.com" -> "acme--uat.sandbox".
    function shortHost(host) {
        return (host || "")
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

    window.SFEN_ORGS = { TYPES, shortHost, orgType, defaultName, displayName };
})();
