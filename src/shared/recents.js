// recents.js
// Single source of truth for the locally-tracked "Recent Setup" list, shared by
// the command palette (commandPalette.js) and the popup (popupUI.js). Loaded
// before both via the manifest content_scripts order and popup.html.
//
// Only setup-type destinations are tracked here (Setup pages, Object Manager,
// Fields, Profiles, Permission Sets, Flow builder). Recently-viewed *records*
// are not stored — they come from the org's RecentlyViewed query.
//
// Each entry remembers its org (SFEN_ORGS.shortHost, so the Lightning, Setup
// and My Domain hosts of one org match) and is only shown on that org: Flow,
// Profile, Permission Set and field links carry ids that don't exist in other
// orgs.
(function () {
    "use strict";

    const KEY = "paletteRecents";
    const CAP = 10; // per org
    const TOTAL_CAP = 100; // across all orgs, so storage can't grow forever

    // In-memory mirror of the stored list. record() writes straight from this
    // (a single storage.set) instead of doing a get-then-set, because the popup
    // calls window.close() immediately after navigating — a get callback would
    // never run, so the write would be lost.
    let cache = [];
    let primed = false; // true once cache reflects stored state

    function isSetup(url) {
        return (
            typeof url === "string" &&
            (url.indexOf("/lightning/setup/") === 0 ||
                url.indexOf("/builder_platform_interaction/") === 0)
        );
    }

    // chrome.* throws "Extension context invalidated" on a stale content script
    // after the extension is reloaded; bail out cleanly in that case.
    function alive() {
        try {
            return !!(chrome && chrome.runtime && chrome.runtime.id);
        } catch (e) {
            return false;
        }
    }

    // Flow links recorded before the version-id fix used the FlowDefinition id
    // (300 prefix); Flow Builder needs a version id (301), so those stored
    // recents fail with "We can't open this flow". Drop them on read so they
    // self-heal out of history.
    function isBrokenFlowUrl(url) {
        return (
            typeof url === "string" &&
            /\/builder_platform_interaction\/flowBuilder\.app\?flowId=300/i.test(url)
        );
    }

    function orgOf(host) {
        return SFEN_ORGS.shortHost(String(host || "").toLowerCase());
    }

    // Entries saved before entries had an org are dropped: there's no telling
    // which org their ids belong to.
    function refresh(list) {
        cache = (Array.isArray(list) ? list : []).filter(
            (x) => x && typeof x.org === "string" && x.org && isSetup(x.url) && !isBrokenFlowUrl(x.url)
        );
        primed = true;
    }

    // The stored list's entries for the org of `host`, newest first.
    function forOrg(list, host) {
        const org = orgOf(host);
        if (!org) return [];
        return (Array.isArray(list) ? list : [])
            .filter((x) => x && x.org === org && isSetup(x.url) && !isBrokenFlowUrl(x.url))
            .slice(0, CAP);
    }

    // host: the hostname of the org the item was opened in.
    function record(item, host) {
        const org = orgOf(host);
        if (!item || !org || !isSetup(item.url) || !alive()) return;
        // Before the cache is primed, merge against fresh storage so we don't
        // clobber existing history with a single entry (rare early click).
        if (!primed) {
            try {
                chrome.storage.local.get({ [KEY]: [] }, (r) => {
                    if (chrome.runtime.lastError || !r) return;
                    refresh(r[KEY]);
                    record(item, host);
                });
            } catch (e) {
                /* context invalidated */
            }
            return;
        }
        cache = cache.filter((x) => !(x.org === org && x.url === item.url));
        cache.unshift({ label: item.label, hint: item.hint, url: item.url, org });
        const perOrg = {};
        cache = cache.filter((x) => (perOrg[x.org] = (perOrg[x.org] || 0) + 1) <= CAP).slice(0, TOTAL_CAP);
        try {
            chrome.storage.local.set({ [KEY]: cache });
        } catch (e) {
            /* context invalidated */
        }
    }

    // cb gets the entries for the org of `host`.
    function load(host, cb) {
        if (!alive()) {
            cb(forOrg(cache, host));
            return;
        }
        try {
            chrome.storage.local.get({ [KEY]: [] }, (r) => {
                if (chrome.runtime.lastError || !r) {
                    cb(forOrg(cache, host));
                    return;
                }
                refresh(r[KEY]);
                cb(forOrg(cache, host));
            });
        } catch (e) {
            cb(forOrg(cache, host));
        }
    }

    // Prime the cache at startup and keep it fresh if another surface writes.
    if (alive()) {
        try {
            chrome.storage.local.get({ [KEY]: [] }, (r) => {
                if (!chrome.runtime.lastError && r) refresh(r[KEY]);
            });
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === "local" && changes[KEY]) refresh(changes[KEY].newValue);
            });
        } catch (e) {
            /* context invalidated */
        }
    }

    window.SFEN_RECENTS = { KEY, isSetup, isBrokenFlowUrl, forOrg, record, load };
})();
