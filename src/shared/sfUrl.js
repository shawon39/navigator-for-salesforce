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

    // Hosts a saved org may point at: Salesforce login, org and site domains
    // (login.salesforce.com, *.my.salesforce.com, *.force.com, *.my.site.com).
    // Anything else could be a look-alike login page.
    const ORG_HOST_SUFFIXES = [".salesforce.com", ".force.com", ".salesforce-setup.com", ".my.site.com"];

    function isOrgHost(host) {
        const h = String(host || "").toLowerCase();
        return /^[a-z0-9.-]+$/.test(h) && ORG_HOST_SUFFIXES.some((s) => h.endsWith(s));
    }

    // A path that is safe to append to an org's origin: starts with a single
    // "/" (not "//" or "/\", which would point at another host, also not
    // URL-encoded as "/%2F" or "/%5C") and has no whitespace or backslashes.
    function isSafePath(path) {
        return typeof path === "string" && /^\/(?![/\\]|%2f|%5c)[^\s\\]*$/i.test(path);
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

    // A token that looks like a record Id: an 18-char Id must end in the
    // checksum of its first 15 characters' casing; a 15-char Id must mix
    // letters and digits (so ordinary 15-letter words don't match). Used for
    // pasted Ids in the palette and to spot pages about one record.
    function looksLikeRecordId(s) {
        if (!/^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(s)) return false;
        if (s.length === 15) return /\d/.test(s) && /[a-zA-Z]/.test(s);
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
        let suffix = "";
        for (let i = 0; i < 15; i += 5) {
            let bits = 0;
            for (let j = 0; j < 5; j++) if (/[A-Z]/.test(s[i + j])) bits |= 1 << j;
            suffix += chars[bits];
        }
        return suffix === s.slice(15).toUpperCase();
    }

    root.SFEN_URL = { SF_HOST_SUFFIXES, isSalesforceHost, isSalesforceUrl, isOrgHost, isSafePath, fuzzy, matchScore, looksLikeRecordId };
})(typeof self !== "undefined" ? self : window);
