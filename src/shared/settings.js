// settings.js
// Shared settings contract for the popup, the Settings page and the content
// scripts. Settings live in chrome.storage.sync under "settings"; read them
// through normalize() so missing keys get their defaults and the old
// darkMode flag maps onto the newer theme setting.
(function () {
    "use strict";

    const DEFAULTS = {
        theme: "light", // "light" | "dark" | "system"
        autoClose: true,
        confirmDelete: true,
        liveOrgAccess: true,
        commandPalette: true,
        setupTabs: true,
        headerPopupButton: true,
        showManaged: false,
        popupTabs: { recent: true, navigate: true, objects: true, orgs: true },
    };

    function normalize(raw) {
        const s = Object.assign({}, DEFAULTS, raw || {});
        s.popupTabs = Object.assign({}, DEFAULTS.popupTabs, (raw && raw.popupTabs) || {});
        if (!raw || !raw.theme) s.theme = raw && raw.darkMode ? "dark" : "light";
        return s;
    }

    // "light" or "dark" for a normalized settings object.
    function resolveTheme(settings) {
        const theme = (settings && settings.theme) || "light";
        if (theme !== "system") return theme;
        return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
    }

    // Put the resolved theme on <html> and remember it for themeBoot.js.
    function applyTheme(settings) {
        const theme = resolveTheme(settings);
        document.documentElement.classList.toggle("nv-dark", theme === "dark");
        document.documentElement.classList.toggle("nv-light", theme !== "dark");
        try {
            localStorage.setItem("nvTheme", theme);
        } catch (e) {}
    }

    function load(callback) {
        chrome.storage.sync.get(["settings"], (res) => callback(normalize(res && res.settings)));
    }

    // Content scripts render inside Salesforce pages: register the bundled
    // fonts on the page once so shadow-DOM UI can use them. If the page's CSP
    // blocks them, the system font fallback is used.
    function injectFonts() {
        if (document.getElementById("sfen-fonts")) return;
        const style = document.createElement("style");
        style.id = "sfen-fonts";
        style.textContent =
            `@font-face{font-family:"Figtree";font-weight:400 700;font-display:swap;` +
            `src:url("${chrome.runtime.getURL("fonts/Figtree.woff2")}") format("woff2");}` +
            `@font-face{font-family:"JetBrains Mono";font-weight:400 500;font-display:swap;` +
            `src:url("${chrome.runtime.getURL("fonts/JetBrainsMono.woff2")}") format("woff2");}`;
        (document.head || document.documentElement).appendChild(style);
    }

    window.SFEN_SETTINGS = { DEFAULTS, normalize, resolveTheme, applyTheme, load, injectFonts };
})();
