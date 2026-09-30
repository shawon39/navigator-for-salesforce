// headerButton.js
// Adds a Navigator ("N") button to Salesforce's Lightning global header,
// before favorites, help, the gear and notifications. It opens the extension
// popup, uses Salesforce's own SLDS button classes so it looks native, and can
// be turned off in Settings ("Navigator button in the header").
(function () {
    "use strict";

    // The Navigator "N" arrow from the app icon, as a stroke in the icon color.
    const N_ARROW = '<path d="M30 96V36L86 92V34M70 50L86 34L102 50"></path>';

    // In display order; each is inserted before the header's own icons.
    const BUTTONS = [
        { id: "sfen-header-nav", setting: "headerPopupButton", build: buildNavigator },
    ];

    let settings = null;

    function alive() {
        try {
            return !!(chrome.runtime && chrome.runtime.id);
        } catch (e) {
            return false;
        }
    }

    function buildItem(id, tag, label, svg) {
        const li = document.createElement("li");
        li.id = id;
        li.className = "slds-global-actions__item slds-grid";
        const el = document.createElement(tag);
        el.className =
            "slds-button slds-button_icon slds-button_icon-container slds-global-actions__item-action " + id + "-btn";
        el.title = label;
        el.setAttribute("aria-label", label);
        el.innerHTML = svg;
        li.appendChild(el);
        return li;
    }

    function buildNavigator(id) {
        const li = buildItem(
            id,
            "button",
            "Open Navigator",
            '<svg class="slds-button__icon slds-global-header__icon" viewBox="18 18 96 96" fill="none" ' +
                'stroke="currentColor" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" ' +
                `aria-hidden="true">${N_ARROW}</svg>`
        );
        li.firstChild.type = "button";
        return li;
    }

    // Keep our enabled buttons first in the header's icon list, in order, once
    // each; remove the ones that are turned off.
    function sync() {
        const on = (b) => alive() && settings && settings[b.setting];
        BUTTONS.forEach((b) => {
            const el = document.getElementById(b.id);
            if (el && !on(b)) el.remove();
        });
        const list = document.querySelector("ul.slds-global-actions");
        if (!list) return;
        let anchor = list.firstElementChild;
        BUTTONS.filter(on).forEach((b) => {
            const el = document.getElementById(b.id) || b.build(b.id);
            if (anchor !== el) list.insertBefore(el, anchor);
            anchor = el.nextElementSibling;
        });
    }

    // One page-level listener, so the "N" button keeps working even if
    // Lightning re-renders or copies the header markup.
    document.addEventListener("click", (e) => {
        if (!e.target.closest || !e.target.closest("#sfen-header-nav") || !alive()) return;
        chrome.runtime.sendMessage({ type: "openPopup" }, () => void chrome.runtime.lastError);
    });

    // Lightning renders the header late and can re-render it; re-check on DOM
    // changes, at most every 250 ms.
    let timer = null;
    const observer = new MutationObserver(() => {
        if (timer) return;
        timer = setTimeout(() => {
            timer = null;
            if (!alive()) return observer.disconnect();
            sync();
        }, 250);
    });

    SFEN_SETTINGS.load((s) => {
        settings = s;
        sync();
        observer.observe(document.documentElement, { childList: true, subtree: true });
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync" || !changes.settings) return;
        settings = SFEN_SETTINGS.normalize(changes.settings.newValue);
        sync();
    });
})();
