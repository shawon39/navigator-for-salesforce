// event.js
// Navigate tab quick grid: points each link at its page on the current org.
(function () {
    "use strict";

    // Quick-grid link id -> path on the current org.
    const PAGES = {
        setup: "/lightning/setup/SetupOneHome/home",
        devConsole: "/_ui/common/apex/debug/ApexCSIPage",
        objManager: "/lightning/setup/ObjectManager/home",
        home: "/lightning/page/home",
        flows: "/lightning/setup/Flows/home",
        inChangeSets: "/lightning/setup/InboundChangeSet/home",
        outChangeSets: "/lightning/setup/OutboundChangeSet/home",
        users: "/lightning/setup/ManageUsers/home",
    };

    const initializeNavigation = async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        // Salesforce check is handled in popup.js; tab.url is undefined off Salesforce.
        if (!tab || !SFEN_URL.isSalesforceUrl(tab.url)) return;
        const baseUrl = new URL(tab.url).origin.replace("my.salesforce-setup.com", "lightning.force.com");

        Object.keys(PAGES).forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const url = PAGES[id];
            // Real href for right-click / modifier clicks.
            el.href = baseUrl + url;
            el.addEventListener("click", (event) => {
                if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                    event.preventDefault();

                    // Record setup destinations for "Recent Setup" (the guard
                    // inside record drops non-setup URLs like Home/Dev Console).
                    if (window.SFEN_RECENTS) {
                        window.SFEN_RECENTS.record(
                            {
                                label: el.dataset.label || (el.textContent || "").trim(),
                                hint: "Setup",
                                url,
                            },
                            new URL(tab.url).hostname
                        );
                    }

                    const go = (path) => {
                        chrome.tabs.update(tab.id, { url: baseUrl + path });

                        // Check autoClose setting before closing window
                        chrome.storage.sync.get(['settings'], (result) => {
                            const settings = result.settings || { autoClose: true };
                            if (settings.autoClose !== false) {
                                window.close();
                            }
                        });
                    };
                    if (id !== "home") return go(url);
                    // Home opens the current app's own landing page (see
                    // appHomePath in background.js), falling back to Home.
                    chrome.runtime.sendMessage(
                        { type: "palette", action: "appHome", host: new URL(tab.url).hostname },
                        (resp) => go(!chrome.runtime.lastError && resp && resp.ok && SFEN_URL.isSafePath(resp.path) ? resp.path : url)
                    );
                }
            });
        });
    };

    // Attach event listeners when DOM is loaded
    document.addEventListener("DOMContentLoaded", initializeNavigation);
})();
