// sfUrl.js
// Shared Salesforce URL checks and fuzzy scoring, used by the background
// worker (importScripts), the popup, the Settings page and the content
// scripts. One copy so the rules can't drift apart.
(function (root) {
    "use strict";

    // Must match the host_permissions in manifest.json.
    const SF_HOST_SUFFIXES = [".force.com", ".my.salesforce.com", ".my.salesforce-setup.com"];

    function isSalesforceHost(hostname) {
        const h = String(hostname || "").toLowerCase();
        return SF_HOST_SUFFIXES.some((s) => h.endsWith(s));
    }

    function isSalesforceUrl(url) {
        try {
            const u = new URL(url);
            return u.protocol === "https:" && isSalesforceHost(u.hostname);
        } catch (e) {
            return false;
        }
    }

    // A path that is safe to append to an org's origin: starts with a single
    // "/" (not "//" or "/\", which would point at another host) and has no
    // whitespace or backslashes.
    function isSafePath(path) {
        return typeof path === "string" && /^\/(?![/\\])[^\s\\]*$/.test(path);
    }

    // Higher is better; -1 means the query's letters aren't all in the text in order.
    function fuzzy(query, text) {
        text = text.toLowerCase();
        let qi = 0, score = 0, prev = -2;
        for (let ti = 0; ti < text.length && qi < query.length; ti++) {
            if (text[ti] === query[qi]) {
                let s = 1;
                if (ti === prev + 1) s += 5;
                if (ti === 0 || /[\s/_\-.|—()]/.test(text[ti - 1])) s += 10;
                score += s;
                prev = ti;
                qi++;
            }
        }
        return qi === query.length ? score - text.length * 0.01 : -1;
    }

    // Search ranking: how well the label matches comes first (exact, prefix,
    // word start, substring), then keywords, then loose letter matching.
    // Loose matching over label + keywords alone lets "users" rank "Tabs"
    // (keywords "... User Interface setup") above the Users page.
    function matchScore(query, label, keywords) {
        const q = query.trim().toLowerCase();
        const l = String(label || "").toLowerCase();
        const k = String(keywords || "").toLowerCase();
        if (!q) return -1;
        const shorter = -l.length * 0.1; // prefer shorter labels within a tier
        if (l === q) return 1000;
        if (l.startsWith(q)) return 800 + shorter;
        const at = l.indexOf(q);
        if (at > 0 && /[\s/_\-.|—()]/.test(l[at - 1])) return 600 + shorter;
        if (at > 0) return 400 + shorter;
        if ((" " + k).includes(" " + q)) return 300 + shorter;
        const f = fuzzy(q, l);
        if (f >= 0) return 100 + Math.min(f, 190);
        const fk = fuzzy(q, l + " " + k);
        return fk >= 0 ? Math.min(fk, 99) : -1;
    }

    root.SFEN_URL = { SF_HOST_SUFFIXES, isSalesforceHost, isSalesforceUrl, isSafePath, fuzzy, matchScore };
})(typeof self !== "undefined" ? self : window);
