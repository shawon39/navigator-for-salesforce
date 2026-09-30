// themeBoot.js
// Loaded in <head> of the popup and Settings page. Settings live in async
// chrome.storage, so apply the last-used theme from localStorage right away to
// avoid a light flash before the real settings load.
(function () {
    "use strict";
    let theme = "light";
    try {
        theme = localStorage.getItem("nvTheme") === "dark" ? "dark" : "light";
    } catch (e) {}
    document.documentElement.classList.add("nv-" + theme);
})();
