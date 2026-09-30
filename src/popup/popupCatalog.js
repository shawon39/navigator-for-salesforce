// popupCatalog.js
// Static catalog data for the popup (popupUI.js): the per-object kebab-menu
// destinations, the fallback object list, and the Setup pages shown in the
// unified search. Loaded before popupUI.js and exposed on window for it to read.
(function () {
    "use strict";

    // Extra per-object destinations shown in the kebab menu (Object Manager nodes).
    // "Open in Object Manager" (/Details/view) is added last by popupUI.js.
    const OBJ_MENU_ITEMS = [
        ["Page Layouts", "/PageLayouts/view"],
        ["Lightning Record Pages", "/LightningPages/view"],
        ["Record Types", "/RecordTypes/view"],
        ["Validation Rules", "/ValidationRules/view"],
        ["Triggers", "/ApexTriggers/view"],
        ["Buttons, Links & Actions", "/ButtonsLinksActions/view"],
        ["Search Layouts", "/MySearchLayouts/view"],
        ["Object Access", "/ObjectAccess/view"],
    ];

    const FALLBACK_OBJECTS = [
        "Account", "Contact", "Lead", "Opportunity", "Case", "Campaign",
        "Contract", "Order", "Product2", "Asset", "Task", "Event", "User", "Quote",
    ];

    // Master Setup list is shared with the command palette; see
    // src/shared/setupPages.js (loaded first). Entries are [label, url, category].
    const SETUP_PAGES = (typeof window !== "undefined" && window.SFEN_SETUP_PAGES) || [];

    window.SFEN_POPUP_CATALOG = {
        OBJ_MENU_ITEMS,
        FALLBACK_OBJECTS,
        SETUP_PAGES,
    };
})();
