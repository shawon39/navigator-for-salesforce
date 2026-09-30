// bookmarks.js
// Navigate tab bookmarks: list, add, rename, remove and drag to reorder
// (chrome.storage.sync "bookmarks", up to 10 { title, url } with url a path).
(function () {
    "use strict";

    const MAX_BOOKMARKS = 10;
    const DEFAULT_BOOKMARKS = [
        { title: "App Manager", url: "/lightning/setup/NavigationMenus/home" },
        { title: "Static Resources", url: "/lightning/setup/StaticResources/home" },
        { title: "Permission Sets", url: "/lightning/setup/PermSets/home" },
        { title: "Installed Packages", url: "/lightning/setup/ImportedPackage/home" },
    ];

    function loadBookmarks() {
        chrome.storage.sync.get("bookmarks", function (result) {
            let bookmarks = result.bookmarks;
            if (!bookmarks) {
                bookmarks = DEFAULT_BOOKMARKS;
                chrome.storage.sync.set({ bookmarks: bookmarks });
            }
            renderBookmarks(bookmarks);
        });
    }

    function saveBookmarks(bookmarks) {
        chrome.storage.sync.set({ bookmarks: bookmarks }, () => {
            if (chrome.runtime.lastError) {
                // Show what's actually stored, not the list that failed to save.
                SFEN_UI.toast("Couldn't save: " + chrome.runtime.lastError.message);
                return loadBookmarks();
            }
            renderBookmarks(bookmarks);
        });
    }

    function renderBookmarks(bookmarks) {
        // Query the active tab to obtain its URL for the proper base URL.
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs[0] || !SFEN_URL.isSalesforceUrl(tabs[0].url)) return;
            const baseUrl = new URL(tabs[0].url).origin;
            const container = document.getElementById("bookmarksContainer");
            container.innerHTML = "";
            bookmarks.forEach((bookmark, index) => {
                // Skip stored entries whose url isn't a path on this org.
                if (!SFEN_URL.isSafePath(bookmark.url)) return;
                container.appendChild(buildBookmarkRow(bookmarks, bookmark, index, baseUrl));
            });
            document.getElementById("bookmarkCount").textContent = `· ${bookmarks.length} of ${MAX_BOOKMARKS}`;
            // Show "Add this page" only while there's room.
            document.getElementById("addBookmark").hidden = bookmarks.length >= MAX_BOOKMARKS;
        });
    }

    function buildBookmarkRow(bookmarks, bookmark, index, baseUrl) {
        const row = document.createElement("div");
        row.className = "nv-row has-actions";
        row.draggable = true;
        row.dataset.index = index;
        row.innerHTML =
            `<a class="nv-row-link">${SFEN_UI.icon("bookmark")}<span class="nv-row-label"></span></a>` +
            '<span class="nv-row-actions">' +
            `<button type="button" class="nv-icon-btn">${SFEN_UI.icon("pencil", 15)}</button>` +
            `<button type="button" class="nv-icon-btn">${SFEN_UI.icon("x", 15)}</button>` +
            "</span>";
        const link = row.querySelector("a");
        link.href = baseUrl + bookmark.url;
        row.querySelector(".nv-row-label").textContent = bookmark.title;
        link.addEventListener("click", function (e) {
            // Left-click without modifiers navigates this tab; let the browser
            // handle ⌘/Ctrl/middle clicks through the real href.
            if (e.button === 0 && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                navigateBookmark(bookmark.url);
            }
        });
        const [renameBtn, removeBtn] = row.querySelectorAll(".nv-row-actions button");
        renameBtn.setAttribute("aria-label", `Rename ${bookmark.title}`);
        renameBtn.title = "Rename";
        removeBtn.setAttribute("aria-label", `Remove ${bookmark.title}`);
        removeBtn.title = "Remove";
        renameBtn.addEventListener("click", () => startRename(row, bookmarks, index));
        removeBtn.addEventListener("click", () => removeBookmark(row, bookmarks, index));

        // Drag and drop to reorder.
        row.addEventListener("dragstart", handleDragStart);
        row.addEventListener("dragend", () => row.classList.remove("is-dragging"));
        row.addEventListener("dragover", handleDragOver);
        row.addEventListener("drop", handleDrop);
        return row;
    }

    function startRename(row, bookmarks, index) {
        const old = bookmarks[index].title;
        row.classList.add("is-editing");
        row.draggable = false;
        row.innerHTML = SFEN_UI.icon("bookmark") + '<input type="text" class="nv-row-input" aria-label="Bookmark name">';
        const input = row.querySelector("input");
        input.value = old;
        input.focus();
        input.select();
        let done = false;
        const finish = (save) => {
            if (done) return;
            done = true;
            const title = input.value.trim();
            if (!save || !title || title === old) return renderBookmarks(bookmarks);
            const next = bookmarks.map((b, i) => (i === index ? { ...b, title } : b));
            saveBookmarks(next);
            SFEN_UI.toast("Bookmark renamed", () => saveBookmarks(bookmarks));
        };
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") finish(true);
            if (e.key === "Escape") {
                e.stopPropagation();
                finish(false);
            }
        });
        input.addEventListener("blur", () => finish(true));
    }

    function navigateBookmark(url) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            let tab = tabs[0];
            if (!tab || !SFEN_URL.isSalesforceUrl(tab.url)) return;
            let baseUrl = new URL(tab.url).origin;
            // Update the active tab's URL so it navigates to the new page.
            chrome.tabs.update(tab.id, { url: baseUrl + url });

            // Check autoClose setting before closing window
            SFEN_SETTINGS.load((settings) => {
                if (settings.autoClose) window.close();
            });
        });
    }

    // Add the current page (from its "/lightning/" segment on) as a bookmark.
    function addBookmark() {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            let tab = tabs[0];
            let currentUrl = (tab && tab.url) || "";
            let lightningIndex = currentUrl.indexOf("/lightning/");
            if (lightningIndex === -1) {
                SFEN_UI.toast("Only Lightning pages can be bookmarked");
                return;
            }
            let bookmarkUrl = currentUrl.substring(lightningIndex);
            // Use the current tab's title automatically as the bookmark title.
            let bookmarkTitle = tab.title.replace(" | Salesforce", "").trim() || "Bookmark";

            chrome.storage.sync.get("bookmarks", function (result) {
                let bookmarks = result.bookmarks || [];
                if (bookmarks.length >= MAX_BOOKMARKS) return;
                saveBookmarks([...bookmarks, { title: bookmarkTitle, url: bookmarkUrl }]);
                SFEN_UI.toast("Bookmark added");
            });
        });
    }

    // Remove a bookmark, asking inline first when "Ask before removing" is on.
    function removeBookmark(row, bookmarks, index) {
        const remove = () => {
            saveBookmarks(bookmarks.filter((_, i) => i !== index));
            SFEN_UI.toast("Bookmark removed", () => saveBookmarks(bookmarks));
        };
        SFEN_SETTINGS.load((settings) => {
            if (settings.confirmDelete) SFEN_UI.confirmInline(row, bookmarks[index].title, "bookmark", remove);
            else remove();
        });
    }

    // Drag and drop functions.
    function handleDragStart(e) {
        this.classList.add("is-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", this.dataset.index);
    }

    function handleDragOver(e) {
        e.preventDefault(); // Allow drop.
        e.dataTransfer.dropEffect = "move";
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        // Only our own rows carry a plain index; ignore dropped text and links.
        const data = e.dataTransfer.getData("text/plain");
        if (!/^\d+$/.test(data)) return;
        const srcIndex = parseInt(data);
        const targetIndex = parseInt(this.dataset.index);
        if (srcIndex !== targetIndex) {
            chrome.storage.sync.get("bookmarks", function (result) {
                let bookmarks = result.bookmarks || [];
                if (srcIndex >= bookmarks.length) return;
                // Remove the dragged item and insert it at the drop position.
                const [removed] = bookmarks.splice(srcIndex, 1);
                bookmarks.splice(targetIndex, 0, removed);
                saveBookmarks(bookmarks);
            });
        }
    }

    window.SFEN_BOOKMARKS = { loadBookmarks, addBookmark };
})();
