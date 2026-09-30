// popup.js
// Popup bootstrap: resolves the active tab, whether it's a Salesforce page, and
// the settings, then applies the theme. Other popup scripts await
// window.SFEN_POPUP_READY instead of repeating these lookups.
window.SFEN_POPUP_READY = (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const settings = await new Promise((resolve) => SFEN_SETTINGS.load(resolve));
    // tab.url is undefined for tabs we have no host access to: not Salesforce.
    return { tab, settings, isSalesforce: SFEN_URL.isSalesforceUrl(tab && tab.url) };
})();

document.addEventListener("DOMContentLoaded", async () => {
    SFEN_UI.fillIcons();
    document.getElementById("settingsBtn").addEventListener("click", () => {
        chrome.runtime.openOptionsPage();
        window.close();
    });

    const { settings, isSalesforce } = await window.SFEN_POPUP_READY;
    SFEN_SETTINGS.applyTheme(settings);
    if (settings.theme === "system" && window.matchMedia) {
        window.matchMedia("(prefers-color-scheme: dark)")
            .addEventListener("change", () => SFEN_SETTINGS.applyTheme(settings));
    }

    if (!isSalesforce) {
        // Off Salesforce, the saved orgs are still the point — you log in
        // *before* you're on a Salesforce page. Show just that list.
        document.body.classList.add("is-off-sf");
        document.body.classList.remove("sfen-booting");
        document.querySelector(".nv-tabs").hidden = true;
        document.getElementById("headerAddOrg").hidden = false;
        document.getElementById("popupSearch").placeholder = "Search your orgs";
        document.getElementById("popupSearch").setAttribute("aria-label", "Search orgs");
        document.getElementById("tab-orgs").hidden = false;
        initQuickLogin({ offSalesforce: true });
        return;
    }

    // Initialize dynamic bookmarks
    SFEN_BOOKMARKS.loadBookmarks();
    document.getElementById("addBookmark").addEventListener("click", SFEN_BOOKMARKS.addBookmark);
});
