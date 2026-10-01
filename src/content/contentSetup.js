// contentSetup.js
(function () {
    "use strict";

    // When the extension is reloaded or updated, the content script already
    // injected into open tabs is orphaned: any chrome.* call then throws
    // "Extension context invalidated". Check this before touching chrome APIs.
    function isExtensionAlive() {
        try {
            return !!(chrome.runtime && chrome.runtime.id);
        } catch (e) {
            return false;
        }
    }

    // Current theme ("light" | "dark") and whether the quick-tab row is enabled,
    // both from the shared settings (see src/shared/settings.js).
    let quickTabsSettings = null;
    let quickTabsTheme = "light";
    let quickTabsEnabled = true;

    // Put the theme class on one of our dialog overlays. The design tokens
    // are defined on these classes in setupStyle.css. The row itself always
    // stays light: it sits inside Salesforce's light header.
    function applyQuickTabsTheme(el) {
        el.classList.remove("sfen-qt-light", "sfen-qt-dark");
        el.classList.add("sfen-qt-" + quickTabsTheme);
    }

    // Re-resolve the theme ("system" follows the OS) and repaint open dialogs.
    function updateQuickTabsTheme() {
        if (!quickTabsSettings) return;
        quickTabsTheme = SFEN_SETTINGS.resolveTheme(quickTabsSettings);
        document.querySelectorAll(".sfen-qt-overlay").forEach(applyQuickTabsTheme);
    }

    // Inline Lucide-style stroke icons.
    function quickTabsIcon(paths, size, strokeWidth) {
        return (
            `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
            `stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
        );
    }
    // Lucide "bookmark-plus" (add this page) and "settings-2" (manage tabs).
    const ICON_BOOKMARK_PLUS =
        '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>' +
        '<line x1="12" x2="12" y1="7" y2="13"></line><line x1="15" x2="9" y1="10" y2="10"></line>';
    const ICON_MANAGE =
        '<path d="M20 7h-9"></path><path d="M14 17H5"></path>' +
        '<circle cx="17" cy="17" r="3"></circle><circle cx="7" cy="7" r="3"></circle>';
    const ICON_X = '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>';
    const ICON_PENCIL = '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path><path d="m15 5 4 4"></path>';
    const ICON_LINK =
        '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>' +
        '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>';
    const ICON_GRIP =
        '<circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle>' +
        '<circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle>';

    // Stored tabs come from sync storage (and imports), so check the shape
    // before rendering or linking to one.
    function isValidTab(tab) {
        return !!tab && typeof tab === "object" && typeof tab.name === "string" && SFEN_URL.isSafePath(tab.link);
    }

    // Change the stored tabs from a fresh read, finding `target` by name +
    // link rather than by its old position, so a change made meanwhile in
    // another tab or on another device isn't overwritten. change(tabs, i)
    // edits the array in place; done(false) means the tab is gone.
    function editTabs(target, change, done) {
        if (!isExtensionAlive()) return;
        chrome.storage.sync.get({ sfTabs: [] }, ({ sfTabs }) => {
            const tabs = Array.isArray(sfTabs) ? sfTabs : [];
            const i = tabs.findIndex((t) => t && t.name === target.name && t.link === target.link);
            if (i === -1) return done(false);
            change(tabs, i);
            chrome.storage.sync.set({ sfTabs: tabs }, () => done(true));
        });
    }

    // Page scripts share this DOM: ignore their synthetic events so they
    // can't drive the quick-tab buttons and dialogs (e.g. click Remove).
    function blockUntrusted(el) {
        ["click", "keydown", "input", "drop", "dragstart"].forEach((type) =>
            el.addEventListener(type, (e) => {
                if (!e.isTrusted) e.stopImmediatePropagation();
            }, true)
        );
    }

    // Function to check if we should show custom tabs on current page
    function shouldShowCustomTabs() {
        const currentPath = window.location.pathname;

        const isSetupPage = currentPath.startsWith('/lightning/setup/');

        const excludedPatterns = [
            '/lightning/r/',
            '/lightning/o/',
        ];

        const isExcludedPage = excludedPatterns.some(pattern => currentPath.includes(pattern));

        return isSetupPage && !isExcludedPage;
    }

    // Lightning is a single-page app: the URL and the header change without a
    // page load. Re-check after DOM changes (at most every 250ms) and add the
    // row when it's missing on a Setup page, or remove it elsewhere.
    function syncQuickTabs() {
        if (!isExtensionAlive()) {
            quickTabsObserver.disconnect();
            return;
        }
        const row = document.getElementById("sfNGTabsURL");
        if (!quickTabsEnabled || !shouldShowCustomTabs()) {
            if (row) row.remove();
            return;
        }
        if (row) return;
        const tabBar = document.querySelector(".tabBar");
        if (tabBar) initQuickTabs(tabBar);
    }

    // "App Home" opens the current app's own landing page (see appHomePath in
    // background.js), so apps without a Home tab don't get an extra Home tab.
    // Falls back to the standard Home page.
    const HOME_LINK = "/lightning/page/home";
    function openAppHome(fallbackUrl) {
        if (!isExtensionAlive()) return (window.location.href = fallbackUrl);
        chrome.runtime.sendMessage(
            { type: "palette", action: "appHome", host: window.location.hostname },
            (resp) => {
                const ok = !chrome.runtime.lastError && resp && resp.ok && SFEN_URL.isSafePath(resp.path);
                window.location.href = ok ? window.location.origin + resp.path : fallbackUrl;
            }
        );
    }

    let syncTimer = null;
    const quickTabsObserver = new MutationObserver(() => {
        if (syncTimer) return;
        syncTimer = setTimeout(() => {
            syncTimer = null;
            syncQuickTabs();
        }, 250);
    });

    function initQuickTabs(tabBar) {
        // Create or get the UL container
        let ul = tabBar.querySelector("#sfNGTabsURL");
        if (!ul) {
            ul = document.createElement("ul");
            ul.id = "sfNGTabsURL";
            ul.setAttribute("aria-label", "Navigator quick tabs");
            blockUntrusted(ul);
            // Any styling for the UL is in setupStyle.css.
            tabBar.appendChild(ul);
        }

        // Global variable to hold the dragged item's index
        let draggedIndex = null;

        // Function to load and render stored tabs on the main UI.
        // Each tab is an object: { name: "Friendly Name", link: "/endpoint" }
        function loadStoredTabs() {
            if (!isExtensionAlive()) return;
            chrome.storage.sync.get({ sfTabs: [] }, (result) => {
                let tabs = result.sfTabs;

                // Add the default tab only if no tabs exist.
                if (tabs.length === 0) {
                    tabs.push({ name: "App Home", link: "/lightning/page/home" });
                    chrome.storage.sync.set({ sfTabs: tabs });
                }

                // Remove all LI elements except the plus and edit buttons.
                Array.from(ul.children).forEach((child) => {
                    if (child.id !== "sfenQtPlusLi" && child.id !== "sfenQtEditLi") {
                        child.remove();
                    }
                });

                // Render each stored tab as an LI element with an anchor element inside.
                tabs.forEach((tab, index) => {
                    if (!isValidTab(tab)) return;
                    const li = document.createElement("li");
                    li.setAttribute("draggable", "true");
                    // Store the index as a data attribute for use during drag/drop
                    li.dataset.index = index;

                    // Create an anchor element to support right-click behavior.
                    const a = document.createElement("a");
                    const baseUrl = window.location.origin;
                    a.href = baseUrl + tab.link;
                    a.textContent = tab.name;
                    a.title = tab.name;

                    // Add click event on the anchor. Intercept left-clicks only.
                    a.addEventListener("click", (event) => {
                        // Only intercept left-click if no modifier keys (command/ctrl) are pressed.
                        if (
                            event.button === 0 &&
                            !event.metaKey &&
                            !event.ctrlKey
                        ) {
                            event.preventDefault(); // Prevent full page reload
                            if (tab.link === HOME_LINK) openAppHome(a.href);
                            else window.location.href = a.href;
                        }
                        // If a modifier key is pressed, let the browser handle the click.
                    });

                    li.appendChild(a);

                    // Drag event listeners remain attached to the LI.
                    li.addEventListener("dragstart", (e) => {
                        draggedIndex = Number(li.dataset.index);
                        li.style.opacity = "0.5";
                        e.dataTransfer.effectAllowed = "move";
                    });

                    li.addEventListener("dragend", () => {
                        li.style.opacity = "1";
                    });

                    li.addEventListener("dragover", (e) => {
                        e.preventDefault(); // Allow drop
                        e.dataTransfer.dropEffect = "move";
                    });

                    li.addEventListener("drop", (e) => {
                        e.preventDefault();
                        const targetIndex = Number(li.dataset.index);
                        if (draggedIndex === null || draggedIndex === targetIndex || !isExtensionAlive())
                            return;
                        // Move the dragged tab to the drop position and reload the UI
                        editTabs(tabs[draggedIndex], (list, from) => {
                            list.splice(Math.min(targetIndex, list.length - 1), 0, list.splice(from, 1)[0]);
                        }, loadStoredTabs);
                        draggedIndex = null;
                    });

                    // Insert before the plus button (if it exists)
                    const plusLi = document.getElementById("sfenQtPlusLi");
                    if (plusLi) {
                        ul.insertBefore(li, plusLi);
                    } else {
                        ul.appendChild(li);
                    }
                });
            });
        }

        // Overlay + dialog shell shared by all dialogs. close() removes it;
        // Escape (for the topmost dialog) and a click on the overlay itself
        // also close it.
        function createDialog(modalClass, label) {
            // The dialogs use Figtree; the row doesn't.
            if (isExtensionAlive()) SFEN_SETTINGS.injectFonts();
            updateQuickTabsTheme();

            const overlay = document.createElement("div");
            overlay.className = "sfen-qt-overlay";
            applyQuickTabsTheme(overlay);
            blockUntrusted(overlay);

            const onKeydown = (e) => {
                if (e.key !== "Escape") return;
                const overlays = document.querySelectorAll(".sfen-qt-overlay");
                if (overlays[overlays.length - 1] !== overlay) return;
                e.preventDefault();
                close();
            };
            const close = () => {
                document.removeEventListener("keydown", onKeydown);
                overlay.remove();
            };
            document.addEventListener("keydown", onKeydown);
            overlay.addEventListener("mousedown", (e) => {
                if (e.target === overlay) close();
            });

            const modal = document.createElement("div");
            modal.className = "sfen-qt-modal " + modalClass;
            modal.setAttribute("role", "dialog");
            modal.setAttribute("aria-modal", "true");
            modal.setAttribute("aria-label", label);

            overlay.appendChild(modal);
            return { overlay, modal, close };
        }

        function createLabel(text, forId) {
            const label = document.createElement("label");
            label.className = "sfen-qt-label";
            label.textContent = text;
            label.htmlFor = forId;
            return label;
        }

        function createInput(id, extraClass) {
            const input = document.createElement("input");
            input.type = "text";
            input.id = id;
            input.className = "sfen-qt-input" + (extraClass ? " " + extraClass : "");
            return input;
        }

        function createButton(text, className) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = className;
            button.textContent = text;
            return button;
        }

        function createIconButton(paths, size, strokeWidth, className, label) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = className;
            button.setAttribute("aria-label", label);
            button.title = label;
            button.innerHTML = quickTabsIcon(paths, size, strokeWidth);
            return button;
        }

        // Function to show a custom modal for editing a specific tab's details.
        function showEditTabModal(index, tab) {
            const { overlay, modal, close } = createDialog("sfen-qt-popover sfen-qt-centered", "Edit quick tab");

            // Tab Name
            modal.appendChild(createLabel("Tab name", "sfenQtEditName"));

            const nameInput = createInput("sfenQtEditName");
            nameInput.placeholder = "e.g. Flows";
            // Prepopulate with the existing tab name; remove " | Salesforce" if present.
            nameInput.value = tab.name.replace(" | Salesforce", "").trim();
            modal.appendChild(nameInput);

            // Tab Link
            modal.appendChild(createLabel("Tab link", "sfenQtEditLink"));

            const linkInput = createInput("sfenQtEditLink", "sfen-qt-input-mono");
            linkInput.placeholder = "e.g. /lightning/setup/Flows/home";
            linkInput.value = tab.link;
            modal.appendChild(linkInput);

            // Div to show inline validation messages
            const validationMsg = document.createElement("div");
            validationMsg.className = "sfen-qt-error";
            validationMsg.setAttribute("role", "alert");
            modal.appendChild(validationMsg);

            const btnContainer = document.createElement("div");
            btnContainer.className = "sfen-qt-actions";

            const cancelBtn = createButton("Cancel", "sfen-qt-btn");
            cancelBtn.addEventListener("click", close);
            btnContainer.appendChild(cancelBtn);

            const saveBtn = createButton("Save", "sfen-qt-btn sfen-qt-btn-primary");
            saveBtn.addEventListener("click", () => {
                let newTabName = nameInput.value.trim();
                let newTabLink = linkInput.value.trim();
                if (!newTabName || !newTabLink) {
                    validationMsg.textContent = "Both fields are required.";
                    return;
                }
                // Validate that the newTabLink contains "/lightning"
                if (!newTabLink.startsWith("/lightning/")) {
                    validationMsg.textContent =
                        'Tab link must start with "/lightning/"';
                    return;
                }
                if (!SFEN_URL.isSafePath(newTabLink)) {
                    validationMsg.textContent = "Tab link can't contain spaces or backslashes.";
                    return;
                }
                if (!isExtensionAlive()) return;
                editTabs(tab, (tabs, i) => {
                    tabs[i] = { name: newTabName, link: newTabLink };
                }, (ok) => {
                    // The tab was removed or changed since the dialog opened (e.g. in another tab).
                    if (!ok) {
                        validationMsg.textContent = "This tab no longer exists.";
                        loadStoredTabs();
                        return;
                    }
                    loadStoredTabs();
                    // If the edit modal list is open, update it instantly.
                    const editListContainer =
                        document.getElementById("editModalListNG");
                    if (editListContainer) {
                        renderEditList(editListContainer);
                    }
                    close();
                });
            });
            btnContainer.appendChild(saveBtn);

            modal.appendChild(btnContainer);
            document.body.appendChild(overlay);
        }

        // Helper: Render the list inside the Edit modal.
        // focusSelector (optional) picks the element to focus after rendering.
        function renderEditList(container, focusSelector) {
            container.innerHTML = ""; // Clear current content
            if (!isExtensionAlive()) return;
            chrome.storage.sync.get({ sfTabs: [] }, (result) => {
                const tabs = result.sfTabs;

                // Move one tab to a new position, save, and re-render both lists.
                let draggedEditIndex = null;
                const moveTab = (from, to, focusAfter) => {
                    editTabs(tabs[from], (list, i) => {
                        list.splice(Math.min(to, list.length - 1), 0, list.splice(i, 1)[0]);
                    }, () => {
                        renderEditList(container, focusAfter);
                        loadStoredTabs();
                    });
                };

                if (tabs.length === 0) {
                    const empty = document.createElement("li");
                    empty.className = "sfen-qt-empty";
                    empty.textContent = "No tabs available.";
                    container.appendChild(empty);
                } else {
                    tabs.forEach((tab, index) => {
                        if (!isValidTab(tab)) return;
                        const item = document.createElement("li");
                        item.className = "sfen-qt-item";
                        item.dataset.index = index;
                        item.draggable = true;

                        // Drag handle; Alt+ArrowUp/Down moves the row from the keyboard.
                        const handle = createIconButton(ICON_GRIP, 15, 2, "sfen-qt-handle", "Reorder " + tab.name);
                        handle.title = "Drag to reorder (Alt+Up/Down)";
                        handle.addEventListener("keydown", (e) => {
                            if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                            e.preventDefault();
                            const to = index + (e.key === "ArrowUp" ? -1 : 1);
                            if (to < 0 || to >= tabs.length) return;
                            moveTab(index, to, `.sfen-qt-item[data-index="${to}"] .sfen-qt-handle`);
                        });
                        item.appendChild(handle);

                        item.addEventListener("dragstart", (e) => {
                            draggedEditIndex = index;
                            item.style.opacity = "0.5";
                            e.dataTransfer.effectAllowed = "move";
                        });

                        item.addEventListener("dragend", () => {
                            item.style.opacity = "1";
                        });

                        item.addEventListener("dragover", (e) => {
                            e.preventDefault(); // Allow drop
                            e.dataTransfer.dropEffect = "move";
                        });

                        item.addEventListener("drop", (e) => {
                            e.preventDefault();
                            if (draggedEditIndex === null || draggedEditIndex === index) return;
                            moveTab(draggedEditIndex, index);
                            draggedEditIndex = null;
                        });

                        const span = document.createElement("span");
                        span.className = "sfen-qt-name";
                        span.textContent = tab.name;
                        item.appendChild(span);

                        if (tab.link === "/lightning/page/home") {
                            const note = document.createElement("span");
                            note.className = "sfen-qt-note";
                            note.textContent = "Always shown";
                            item.appendChild(note);
                        }

                        // Rename in place: Enter or blur saves, Escape (or an empty name) cancels.
                        const editBtn = createIconButton(ICON_PENCIL, 15, 1.8, "sfen-qt-icon-btn", "Rename " + tab.name);
                        editBtn.addEventListener("click", () => {
                            const input = createInput("sfenQtRename", "sfen-qt-rename");
                            input.setAttribute("aria-label", "Tab name");
                            input.value = tab.name;
                            item.draggable = false;
                            item.classList.add("sfen-qt-renaming");
                            span.replaceWith(input);
                            input.focus();
                            input.select();

                            let done = false;
                            const finish = (save, focusAfter) => {
                                if (done) return;
                                done = true;
                                const newName = input.value.trim();
                                if (!save || !newName || newName === tab.name) {
                                    input.replaceWith(span);
                                    item.classList.remove("sfen-qt-renaming");
                                    item.draggable = true;
                                    if (focusAfter) editBtn.focus();
                                    return;
                                }
                                editTabs(tab, (list, i) => {
                                    list[i] = { name: newName, link: tab.link };
                                }, () => {
                                    renderEditList(container, focusAfter && `.sfen-qt-item[data-index="${index}"] .sfen-qt-icon-btn`);
                                    loadStoredTabs();
                                });
                            };
                            input.addEventListener("keydown", (e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    finish(true, true);
                                } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    finish(false, true);
                                }
                            });
                            input.addEventListener("blur", () => finish(true, false));
                        });
                        item.appendChild(editBtn);

                        // The link is still edited in the small form dialog.
                        const linkBtn = createIconButton(ICON_LINK, 15, 1.8, "sfen-qt-icon-btn", "Edit link for " + tab.name);
                        linkBtn.addEventListener("click", () => {
                            showEditTabModal(index, tab);
                        });
                        item.appendChild(linkBtn);

                        if (tab.link !== "/lightning/page/home") {
                            const deleteBtn = createIconButton(ICON_X, 15, 1.8, "sfen-qt-icon-btn sfen-qt-remove", "Remove " + tab.name);
                            deleteBtn.addEventListener("click", () => {
                                if (!isExtensionAlive()) return;
                                SFEN_SETTINGS.load((settings) => {
                                    if (settings.confirmDelete && !confirm(`Remove "${tab.name}"?`)) return;
                                    editTabs(tab, (list, i) => list.splice(i, 1), () => {
                                        renderEditList(container);
                                        loadStoredTabs();
                                    });
                                });
                            });
                            item.appendChild(deleteBtn);
                        }

                        container.appendChild(item);
                    });
                }

                const focusEl = focusSelector && container.querySelector(focusSelector);
                if (focusEl) focusEl.focus();
            });
        }

        // Function to show a custom modal for adding a new tab.
        // Opens as a popover under the plus button, without a scrim.
        function showAddTabModal() {
            const { overlay, modal, close } = createDialog("sfen-qt-popover", "Add this page to quick tabs");
            overlay.classList.add("sfen-qt-overlay-clear");

            const plusButton = document.querySelector("#sfenQtPlusLi button");
            if (plusButton) {
                const rect = plusButton.getBoundingClientRect();
                modal.style.top = rect.bottom + 6 + "px";
                modal.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 328)) + "px";
            }

            modal.appendChild(createLabel("Add this page as", "sfenQtAddName"));

            const nameInput = createInput("sfenQtAddName");
            nameInput.placeholder = "Enter Tab Name";
            // Pre-populate the input with the current tab's title; remove " | Salesforce" if present.
            nameInput.value = document.title.replace(" | Salesforce", "");
            modal.appendChild(nameInput);

            // Div to show inline validation messages
            const validationMsg = document.createElement("div");
            validationMsg.className = "sfen-qt-error";
            validationMsg.setAttribute("role", "alert");
            modal.appendChild(validationMsg);

            const btnContainer = document.createElement("div");
            btnContainer.className = "sfen-qt-actions";

            const cancelBtn = createButton("Cancel", "sfen-qt-btn");
            cancelBtn.addEventListener("click", close);
            btnContainer.appendChild(cancelBtn);

            const saveBtn = createButton("Add", "sfen-qt-btn sfen-qt-btn-primary");
            saveBtn.addEventListener("click", () => {
                let tabName = nameInput.value.trim();
                if (!tabName) {
                    validationMsg.textContent = "Tab name is required.";
                    return;
                }

                // The tab link is the current page's path (plus query and hash).
                const tabLink = window.location.pathname + window.location.search + window.location.hash;
                if (!tabLink.startsWith("/lightning/") || !SFEN_URL.isSafePath(tabLink)) {
                    validationMsg.textContent =
                        "Current URL is not a Lightning page.";
                    return;
                }

                if (!isExtensionAlive()) return;
                chrome.storage.sync.get({ sfTabs: [] }, (result) => {
                    const tabs = result.sfTabs;
                    tabs.push({ name: tabName, link: tabLink });
                    chrome.storage.sync.set({ sfTabs: tabs }, () => {
                        loadStoredTabs();
                        close();
                    });
                });
            });
            btnContainer.appendChild(saveBtn);

            modal.appendChild(btnContainer);
            document.body.appendChild(overlay);
        }

        // Function to show a modal for editing/deleting stored tabs.
        function showEditModal() {
            const { overlay, modal, close } = createDialog("sfen-qt-dialog", "Edit quick tabs");

            const header = document.createElement("div");
            header.className = "sfen-qt-head";

            const title = document.createElement("h2");
            title.className = "sfen-qt-title";
            title.textContent = "Edit quick tabs";
            header.appendChild(title);

            const closeIcon = createIconButton(ICON_X, 17, 2, "sfen-qt-icon-btn sfen-qt-close", "Close");
            closeIcon.addEventListener("click", close);
            header.appendChild(closeIcon);
            modal.appendChild(header);

            const list = document.createElement("ol");
            list.id = "editModalListNG";
            list.className = "sfen-qt-list";
            list.setAttribute("aria-label", "Quick tabs");
            modal.appendChild(list);

            renderEditList(list);

            const footer = document.createElement("div");
            footer.className = "sfen-qt-foot";

            const hint = document.createElement("span");
            hint.className = "sfen-qt-hint";
            hint.textContent = "Drag to reorder";
            footer.appendChild(hint);

            const closeBtn = createButton("Done", "sfen-qt-btn sfen-qt-btn-primary");
            closeBtn.addEventListener("click", close);
            footer.appendChild(closeBtn);
            modal.appendChild(footer);

            document.body.appendChild(overlay);
        }

        // Create the plus button LI (for adding new tabs) if it doesn't exist.
        let plusLi = document.getElementById("sfenQtPlusLi");
        if (!plusLi) {
            plusLi = document.createElement("li");
            plusLi.id = "sfenQtPlusLi";

            const plusButton = createIconButton(ICON_BOOKMARK_PLUS, 16, 1.8, "", "Add this page as a quick tab");
            plusButton.addEventListener("click", showAddTabModal);
            plusLi.appendChild(plusButton);
            ul.appendChild(plusLi);
        }

        // Create the edit button LI (for editing/deleting tabs) if it doesn't exist.
        let editLi = document.getElementById("sfenQtEditLi");
        if (!editLi) {
            editLi = document.createElement("li");
            editLi.id = "sfenQtEditLi";

            const editButton = createIconButton(ICON_MANAGE, 15, 1.8, "", "Manage quick tabs");
            editButton.insertAdjacentHTML("beforeend", "<span>Manage</span>");
            editButton.addEventListener("click", showEditModal);
            editLi.appendChild(editButton);
            ul.appendChild(editLi);
        }

        // Finally, load the stored tabs on startup.
        loadStoredTabs();
    }

    // Read the settings, then watch the page for the Setup header if the
    // setupTabs setting allows it.
    if (isExtensionAlive()) {
        SFEN_SETTINGS.load((settings) => {
            quickTabsSettings = settings;
            quickTabsTheme = SFEN_SETTINGS.resolveTheme(settings);
            quickTabsEnabled = settings.setupTabs;
            syncQuickTabs();
            quickTabsObserver.observe(document.documentElement, { childList: true, subtree: true });
        });

        // Follow theme and setupTabs changes live.
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== "sync" || !changes.settings || !isExtensionAlive()) return;
            quickTabsSettings = SFEN_SETTINGS.normalize(changes.settings.newValue);
            updateQuickTabsTheme();
            quickTabsEnabled = quickTabsSettings.setupTabs;
            syncQuickTabs();
        });

        // The "system" theme follows OS light/dark changes.
        if (window.matchMedia) {
            window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateQuickTabsTheme);
        }
    }
})();
