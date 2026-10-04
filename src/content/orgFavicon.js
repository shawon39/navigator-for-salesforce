// orgFavicon.js
// Tab colors by org: when Settings → Orgs → "Color browser tabs by org" is on,
// a saved org's tab icon becomes a Salesforce cloud in its color (see
// src/shared/orgColors.js).
// Runs in the top frame only; Chrome ignores icons set by frames.
(function () {
    "use strict";

    if (!alive()) return;
    const C = window.SFEN_ORG_COLORS;
    const O = window.SFEN_ORGS;
    const ICON = 'link[rel~="icon" i]';
    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

    let want = null; // { color, letter, prod } for this tab, or null when off
    // "data": an SVG data URL with the initial. "file": the same cloud without
    // the initial from images/tab/, for pages whose CSP blocks data: images
    // (extension files aren't blocked).
    let mode = "data";
    let ours = null; // our <link rel="icon">
    let stash = []; // the page's own icon links, put back when turned off
    let dataSetAt = 0; // when a data: icon was last set, to match its CSP violation
    let fixes = []; // times the page changed the icon back, to stop a tug of war

    // After the extension is reloaded, chrome.* throws on already-open tabs.
    function alive() {
        try {
            return !!(chrome.runtime && chrome.runtime.id);
        } catch (e) {
            return false;
        }
    }

    // Chrome's tab strip is dark in dark mode and in incognito.
    function isDark() {
        let incognito = false;
        try {
            incognito = !!(chrome.extension && chrome.extension.inIncognitoContext);
        } catch (e) {}
        return darkQuery.matches || incognito;
    }

    function iconHref() {
        const dark = isDark();
        if (mode === "file") {
            return chrome.runtime.getURL(`images/tab/${want.color}${want.prod ? "-prod" : ""}-${dark ? "dark" : "light"}.svg`);
        }
        return C.iconUrl(want.color, want.letter, want.prod, dark);
    }

    // Make our link the only icon link in <head> (the only place Chrome reads
    // icons from), with the right href. Other icon links must go, not just come
    // first: a cached icon can win over link order. Returns true if it changed
    // anything.
    function apply() {
        const head = document.head;
        if (!head || !want) return false;
        let changed = false;
        Array.from(head.children).forEach((el) => {
            if (el === ours || !el.matches(ICON)) return;
            el.remove();
            if (!el.hasAttribute("data-nv-restore")) stash.push(el);
            changed = true;
        });
        if (!ours) {
            ours = document.createElement("link");
            ours.setAttribute("data-nv-favicon", "");
        }
        const href = iconHref();
        if (ours.getAttribute("href") !== href || ours.getAttribute("rel") !== "icon") {
            ours.rel = "icon";
            ours.type = "image/svg+xml";
            ours.href = href;
            changed = true;
        }
        if (ours.parentNode !== head) {
            head.appendChild(ours);
            changed = true;
        }
        if (changed && mode === "data") dataSetAt = Date.now();
        return changed;
    }

    // Put the page's own icon back. With none to put back, point at
    // /favicon.ico: removing ours alone leaves it in the tab.
    function restore() {
        observer.disconnect();
        if (!ours || !ours.parentNode) return;
        ours.remove();
        const head = document.head;
        if (stash.length) {
            stash.forEach((el) => head.appendChild(el));
        } else {
            const link = document.createElement("link");
            link.rel = "icon";
            link.href = "/favicon.ico";
            link.setAttribute("data-nv-restore", "");
            head.appendChild(link);
        }
        stash = [];
    }

    // Lightning can swap the icon when it navigates; put ours back. If the
    // page keeps changing it (more than 20 times in 10 s), let the page win.
    const observer = new MutationObserver(() => {
        if (!want || !apply()) return;
        const now = Date.now();
        fixes = fixes.filter((t) => now - t < 10000);
        fixes.push(now);
        if (fixes.length > 20) observer.disconnect();
    });

    function update(res) {
        const settings = SFEN_SETTINGS.normalize(res.settings);
        const orgs = Array.isArray(res.quickOrgs) ? res.quickOrgs : [];
        const short = O.shortHost(location.hostname);
        const org = settings.orgTabColors
            ? orgs.find((o) => o && typeof o.host === "string" && O.shortHost(o.host.toLowerCase()) === short)
            : null;
        // No saved org, the feature is off, or no <head> (XML and other raw responses).
        if (!org || !document.head) {
            want = null;
            restore();
            return;
        }
        want = {
            color: C.assign(orgs, res.orgColors)[C.keyOf(org)],
            letter: C.initial(org),
            prod: O.orgType(org) === "production",
        };
        fixes = [];
        apply();
        observer.observe(document.head, { childList: true });
        observer.observe(ours, { attributes: true, attributeFilter: ["href", "rel"] });
    }

    function read() {
        if (!alive()) return;
        try {
            chrome.storage.sync.get(["settings", "quickOrgs", "orgColors"], (res) => {
                if (chrome.runtime.lastError || !res) return;
                update(res);
            });
        } catch (e) {
            /* context invalidated */
        }
    }

    // The page's CSP blocked our data: icon: switch to the extension file.
    // Report-only policies and other images' violations don't count.
    document.addEventListener("securitypolicyviolation", (e) => {
        if (mode !== "data" || !want || e.disposition !== "enforce" || e.blockedURI !== "data") return;
        if (!/^(img-src|default-src)$/.test(e.effectiveDirective) || Date.now() - dataSetAt > 1000) return;
        mode = "file";
        apply();
    });

    darkQuery.addEventListener("change", () => want && apply());
    // A page restored from the back/forward cache may have missed changes.
    window.addEventListener("pageshow", (e) => e.persisted && read());
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "sync" && (changes.settings || changes.quickOrgs || changes.orgColors)) read();
        });
    } catch (e) {
        /* context invalidated */
    }
    read();
})();
