// recents.js
// Single source of truth for the locally-tracked "Recent Setup" list, shared by
// the command palette (commandPalette.js) and the popup (popupUI.js). Loaded
// before both via the manifest content_scripts order and popup.html.
//
// Only setup-type destinations are tracked here (Setup pages, Object Manager,
// Fields, Profiles, Permission Sets, Flow builder). Recently-viewed *records*
// are not stored — they come from the org's RecentlyViewed query.
(function () {
    "use strict";

    const KEY = "paletteRecents";
    const CAP = 10;

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

    function refresh(list) {
        cache = (list || []).filter(
            (x) => x && isSetup(x.url) && !isBrokenFlowUrl(x.url)
        );
        primed = true;
    }

    function record(item) {
        if (!item || !isSetup(item.url) || !alive()) return;
        // Before the cache is primed, merge against fresh storage so we don't
        // clobber existing history with a single entry (rare early click).
        if (!primed) {
            try {
                chrome.storage.local.get({ [KEY]: [] }, (r) => {
                    if (chrome.runtime.lastError || !r) return;
                    refresh(r[KEY]);
                    record(item);
                });
            } catch (e) {
                /* context invalidated */
            }
            return;
        }
        cache = cache.filter((x) => x && x.url !== item.url);
        cache.unshift({ label: item.label, hint: item.hint, url: item.url });
        cache = cache.slice(0, CAP);
        try {
            chrome.storage.local.set({ [KEY]: cache });
        } catch (e) {
            /* context invalidated */
        }
    }

    function load(cb) {
        if (!alive()) {
            cb(cache.slice());
            return;
        }
        try {
            chrome.storage.local.get({ [KEY]: [] }, (r) => {
                if (chrome.runtime.lastError || !r) {
                    cb(cache.slice());
                    return;
                }
                refresh(r[KEY]);
                cb(cache.slice());
            });
        } catch (e) {
            cb(cache.slice());
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

    window.SFEN_RECENTS = { KEY, isSetup, isBrokenFlowUrl, record, load };
})();
