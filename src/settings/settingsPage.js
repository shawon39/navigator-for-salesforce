// settingsPage.js
// The full-page Settings screen (options page). Reads and writes the shared
// "settings" object (see src/shared/settings.js) and the saved orgs
// ("quickOrgs", see src/shared/orgs.js) in chrome.storage.sync, and re-renders
// when the popup changes them.
(function () {
    "use strict";

    const S = window.SFEN_SETTINGS;
    const O = window.SFEN_ORGS;
    const U = window.SFEN_URL;
    const $ = (id) => document.getElementById(id);

    const TAB_KEYS = Object.keys(S.DEFAULTS.popupTabs);
    const EXPORT_KEYS = ["bookmarks", "sfTabs", "quickOrgs", "pinnedObjects", "settings"];
    const MAX_BOOKMARKS = 10; // same caps as the popup
    const MAX_ORGS = 50;
    const ENV_VARS = { production: "prod", sandbox: "sandbox", scratch: "scratch", developer: "dev", trailhead: "other" };
    const ICON_X =
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';

    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    let settings = S.normalize(null);
    let orgs = []; // saved orgs as last read or written

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // ---------- Status line ----------

    let statusTimer = null;

    function showStatus(text, isError) {
        const status = $("status");
        status.textContent = text;
        status.classList.toggle("is-error", !!isError);
        status.classList.add("is-visible");
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => status.classList.remove("is-visible"), 3000);
    }

    // ---------- Storage writes ----------

    // Settings and orgs live in memory: UI changes apply at once and are
    // written one at a time, in order (no get-then-set races).
    let writeQueue = Promise.resolve();
    let inFlight = 0;

    function writeSync(items, done) {
        inFlight++;
        writeQueue = writeQueue.then(
            () =>
                new Promise((resolve) =>
                    chrome.storage.sync.set(items, () => {
                        inFlight--;
                        const err = chrome.runtime.lastError;
                        if (err) {
                            // Show what's actually stored, not what failed to save.
                            showStatus("Couldn't save: " + err.message, true);
                            renderAll();
                        }
                        if (done) done(!err);
                        resolve();
                    })
                )
        );
    }

    // Settings writes are debounced so holding an arrow key on the theme
    // radio doesn't flood chrome.storage.sync (it has a per-minute write cap).
    let saveTimer = null;

    function flushSettings() {
        if (!saveTimer) return;
        clearTimeout(saveTimer);
        saveTimer = null;
        writeSync({ settings });
    }

    function cancelSettingsSave() {
        clearTimeout(saveTimer);
        saveTimer = null;
    }

    // ---------- Settings ----------

    function applyTheme() {
        S.applyTheme(settings);
    }

    function setSwitch(sw, on) {
        sw.setAttribute("aria-checked", on ? "true" : "false");
    }

    function renderSettings() {
        applyTheme();
        document.querySelectorAll("[data-theme-option]").forEach((btn) => {
            const on = btn.dataset.themeOption === settings.theme;
            btn.setAttribute("aria-checked", on ? "true" : "false");
            btn.tabIndex = on ? 0 : -1;
        });
        document.querySelectorAll("[data-setting]").forEach((sw) => setSwitch(sw, settings[sw.dataset.setting]));

        // The popup needs at least one tab: lock the last one that is on.
        const onCount = TAB_KEYS.filter((k) => settings.popupTabs[k]).length;
        document.querySelectorAll("[data-popup-tab]").forEach((sw) => {
            const on = settings.popupTabs[sw.dataset.popupTab];
            setSwitch(sw, on);
            sw.disabled = on && onCount === 1;
            sw.title = sw.disabled ? "At least one tab stays on" : "";
        });
    }

    // Apply a change now and write the whole object back shortly.
    function updateSettings(change) {
        change(settings);
        renderSettings();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flushSettings, 300);
    }

    function bindSettings() {
        const options = Array.from(document.querySelectorAll("[data-theme-option]"));
        options.forEach((btn, i) => {
            btn.addEventListener("click", () => updateSettings((s) => (s.theme = btn.dataset.themeOption)));
            // Arrow keys move the selection within the radio group.
            btn.addEventListener("keydown", (e) => {
                const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
                if (!step) return;
                e.preventDefault();
                const next = options[(i + step + options.length) % options.length];
                next.focus();
                next.click();
            });
        });

        document.querySelectorAll("[data-setting]").forEach((sw) => {
            sw.addEventListener("click", () => updateSettings((s) => (s[sw.dataset.setting] = !s[sw.dataset.setting])));
        });

        document.querySelectorAll("[data-popup-tab]").forEach((sw) => {
            sw.addEventListener("click", () =>
                updateSettings((s) => {
                    const key = sw.dataset.popupTab;
                    const onCount = TAB_KEYS.filter((k) => s.popupTabs[k]).length;
                    if (s.popupTabs[key] && onCount === 1) return;
                    s.popupTabs[key] = !s.popupTabs[key];
                })
            );
        });

        darkQuery.addEventListener("change", () => {
            if (settings.theme === "system") applyTheme();
        });
    }

    // ---------- Orgs ----------

    const orgKey = (org) => org.id || org.host;

    function changeOrgs(change) {
        const list = orgs.map((o) => Object.assign({}, o));
        if (change(list) === false) return;
        renderOrgs(list);
        writeSync({ quickOrgs: list });
    }

    function saveName(org, value) {
        const label = value.trim();
        changeOrgs((list) => {
            const target = list.find((o) => orgKey(o) === orgKey(org));
            if (!target || (target.label || "") === label) return false;
            target.label = label;
        });
    }

    function removeOrg(org) {
        if (settings.confirmDelete && !confirm(`Remove "${O.displayName(org)}"?`)) return;
        changeOrgs((list) => {
            const i = list.findIndex((o) => orgKey(o) === orgKey(org));
            if (i < 0) return false;
            list.splice(i, 1);
        });
    }

    function orgRow(org) {
        const host = O.shortHost(org.host);
        const name = O.displayName(org);
        const row = el("div", "st-org-grid st-org-row st-item");

        const input = el("input", "st-org-name");
        input.type = "text";
        input.dataset.key = orgKey(org);
        input.setAttribute("aria-label", "Name for " + host);
        input.placeholder = O.defaultName(org.host);
        // A label that is really the host (older saves) counts as unnamed.
        input.value = name === (org.label || "").trim() ? name : "";
        let timer = null;
        input.addEventListener("input", () => {
            clearTimeout(timer);
            timer = setTimeout(() => saveName(org, input.value), 400);
        });
        input.addEventListener("change", () => {
            clearTimeout(timer);
            saveName(org, input.value);
        });

        const hostCell = el("span", "st-org-host", host);
        hostCell.title = org.host;

        const type = O.orgType(org);
        const typeCell = el("span", "st-org-type", O.TYPES[type]);
        typeCell.style.setProperty("--dot", `var(--nv-env-${ENV_VARS[type]})`);

        const actions = el("span", "st-org-actions");
        const remove = el("button", "st-icon-btn");
        remove.type = "button";
        remove.setAttribute("aria-label", "Remove " + name);
        remove.title = "Remove";
        remove.innerHTML = ICON_X;
        remove.addEventListener("click", () => removeOrg(org));
        actions.appendChild(remove);

        row.append(input, hostCell, typeCell, actions);
        return row;
    }

    function renderOrgs(saved) {
        orgs = saved;
        // Keep the name field the user is typing in (re-renders come from our own saves too).
        const active = document.activeElement;
        const typing = active && active.classList.contains("st-org-name")
            ? { key: active.dataset.key, value: active.value, start: active.selectionStart, end: active.selectionEnd }
            : null;

        const list = $("orgList");
        list.replaceChildren(...orgs.map(orgRow));
        $("orgHead").hidden = orgs.length === 0;
        $("orgEmpty").hidden = orgs.length > 0;

        if (typing) {
            const input = Array.from(list.querySelectorAll(".st-org-name")).find((i) => i.dataset.key === typing.key);
            if (input) {
                input.value = typing.value;
                input.focus();
                input.setSelectionRange(typing.start, typing.end);
            }
        }
        applySearch();
    }

    // ---------- Shortcuts ----------

    // Mac shortcuts come as glyphs ("⌥N"); space them out like "⌥ N".
    function formatKey(shortcut) {
        return shortcut.includes("+") ? shortcut : shortcut.split("").join(" ");
    }

    function renderShortcuts() {
        chrome.commands.getAll((commands) => {
            const keys = {};
            (commands || []).forEach((c) => (keys[c.name] = c.shortcut || ""));
            document.querySelectorAll("[data-command]").forEach((cell) => {
                const key = keys[cell.dataset.command];
                cell.textContent = key ? formatKey(key) : "Not set";
                cell.classList.toggle("is-unset", !key);
            });
            $("paletteKey").textContent = keys.open_command_palette || "";
            $("keysBanner").hidden = !(commands || []).some((c) => !c.shortcut);
        });
    }

    // ---------- Data ----------

    function exportData() {
        chrome.storage.sync.get(EXPORT_KEYS, (data) => {
            const out = {
                version: "2.0",
                timestamp: new Date().toISOString(),
                bookmarks: data.bookmarks || [],
                sfTabs: data.sfTabs || [],
                quickOrgs: data.quickOrgs || [],
                pinnedObjects: data.pinnedObjects || [],
                settings: S.normalize(data.settings),
            };
            const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = el("a");
            a.href = url;
            a.download = `navigator-for-salesforce-${out.timestamp.slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showStatus("Exported your data.");
        });
    }

    // Same cleanup the popup applies to a pasted org address.
    function cleanHost(input) {
        return (input || "")
            .trim()
            .replace(/^https?:\/\//, "")
            .replace(/\/.*$/, "");
    }

    // Import checks, one entry at a time: each returns the entry to keep, or
    // null to skip it. Links must be plain paths on the org.
    const isStr = (v) => typeof v === "string";
    const CLEAN = {
        bookmarks: (b) => (b && isStr(b.title) && U.isSafePath(b.url) ? { title: b.title, url: b.url } : null),
        sfTabs: (t) => (t && isStr(t.name) && U.isSafePath(t.link) ? { name: t.name, link: t.link } : null),
        quickOrgs: (o) => {
            if (!o || !isStr(o.host) || !(o.label == null || isStr(o.label))) return null;
            const host = cleanHost(o.host);
            if (!/^[A-Za-z0-9.-]+$/.test(host) || !(U.isSalesforceHost(host) || host.includes("."))) return null;
            return {
                id: isStr(o.id) && o.id ? o.id : crypto.randomUUID(),
                label: o.label || "",
                host,
                isSandbox: o.isSandbox === true,
                pinned: o.pinned === true,
            };
        },
        pinnedObjects: (p) => (isStr(p) && /^[A-Za-z0-9_]+$/.test(p) ? p : null),
    };
    const CAPS = { bookmarks: MAX_BOOKMARKS, quickOrgs: MAX_ORGS };

    // Accepts this page's export (version "2.0") and the older popup export
    // (version "1.0": bookmarks + settings).
    function importData(file) {
        const reader = new FileReader();
        reader.onload = () => {
            let data = null;
            try {
                data = JSON.parse(reader.result);
            } catch (e) {
                data = null;
            }
            const next = {};
            let kept = 0;
            let skipped = 0;
            if (data && typeof data === "object" && data.version) {
                EXPORT_KEYS.forEach((k) => {
                    const v = data[k];
                    if (k === "settings") {
                        if (v && typeof v === "object" && !Array.isArray(v)) {
                            next.settings = S.normalize(v);
                            kept++;
                        }
                        return;
                    }
                    if (!Array.isArray(v)) return;
                    const good = v.map(CLEAN[k]).filter((x) => x !== null).slice(0, CAPS[k]);
                    if (k === "quickOrgs") {
                        // Ids must be unique; give duplicates a fresh one.
                        const seen = new Set();
                        good.forEach((o) => {
                            if (seen.has(o.id)) o.id = crypto.randomUUID();
                            seen.add(o.id);
                        });
                    }
                    next[k] = good;
                    kept += good.length;
                    skipped += v.length - good.length;
                });
            }
            if (!Object.keys(next).length) {
                showStatus("That file isn't a Navigator export.", true);
                return;
            }
            if (!confirm("Replace your current data with the contents of this file?")) return;
            cancelSettingsSave(); // the file's settings win over an unsaved change
            writeSync(next, (ok) => {
                if (ok) showStatus(`Imported ${kept} item${kept === 1 ? "" : "s"}, skipped ${skipped}.`);
                renderAll();
            });
        };
        reader.readAsText(file);
    }

    function resetSettings() {
        if (!confirm("Turn every option back to its default? Your bookmarks and orgs are kept.")) return;
        cancelSettingsSave();
        writeSync({ settings: S.normalize(S.DEFAULTS) }, (ok) => {
            if (ok) showStatus("Settings reset to defaults.");
            renderAll();
        });
    }

    function clearAll() {
        if (!confirm("Delete everything Navigator stores in this browser, including bookmarks, orgs and settings? This can't be undone.")) return;
        cancelSettingsSave();
        chrome.storage.sync.clear(() => {
            chrome.storage.local.clear(() => {
                settings = S.normalize(null);
                renderSettings();
                renderOrgs([]);
                // applyTheme remembers the theme for themeBoot.js; forget it too.
                try {
                    localStorage.removeItem("nvTheme");
                } catch (e) {}
                showStatus("All data cleared.");
            });
        });
    }

    function bindData() {
        $("exportBtn").addEventListener("click", exportData);
        $("importBtn").addEventListener("click", () => $("importFile").click());
        $("importFile").addEventListener("change", (e) => {
            const file = e.target.files[0];
            e.target.value = "";
            if (file) importData(file);
        });
        $("resetBtn").addEventListener("click", resetSettings);
        $("clearBtn").addEventListener("click", clearAll);
        // chrome:// pages can't be opened from a plain link.
        $("changeKeys").addEventListener("click", (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
        });
        $("setKeys").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));
    }

    // ---------- Search ----------

    function applySearch() {
        const q = $("search").value.trim().toLowerCase();
        let anyShown = false;
        document.querySelectorAll(".st-section").forEach((section) => {
            const headMatch = !q || section.querySelector(".st-section-head").textContent.toLowerCase().includes(q);
            let shown = 0;
            section.querySelectorAll(".st-item").forEach((item) => {
                // Org rows show their name in an input (value, or placeholder when blank).
                const names = Array.from(item.querySelectorAll("input")).map((i) => i.value + " " + i.placeholder);
                const text = (item.textContent + " " + names.join(" ")).toLowerCase();
                // Never hide the row being typed in.
                const match = headMatch || text.includes(q) || item.contains(document.activeElement);
                item.hidden = !match;
                if (match) shown++;
            });
            section.hidden = !headMatch && shown === 0;
            document.querySelector(`.st-nav a[href="#${section.id}"]`).hidden = section.hidden;
            if (!section.hidden) anyShown = true;
        });
        $("noResults").hidden = anyShown;
        updateCurrent();
    }

    // ---------- Sidebar: mark the section in view ----------

    let clicked = null; // a section picked in the sidebar that can't scroll to the top

    function setCurrent(id) {
        document.querySelectorAll(".st-nav a").forEach((a) => {
            if (a.getAttribute("href") === "#" + id) a.setAttribute("aria-current", "page");
            else a.removeAttribute("aria-current");
        });
    }

    function updateCurrent() {
        const sections = Array.from(document.querySelectorAll(".st-section")).filter((s) => !s.hidden);
        if (!sections.length) return;
        const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
        if (!atBottom) clicked = null;
        let current = sections[0];
        sections.forEach((s) => {
            if (s.getBoundingClientRect().top <= 120) current = s;
        });
        if (atBottom) current = clicked || sections[sections.length - 1];
        setCurrent(current.id);
    }

    function bindNav() {
        document.querySelectorAll(".st-nav a").forEach((a) => {
            a.addEventListener("click", () => {
                clicked = $(a.getAttribute("href").slice(1));
                setCurrent(clicked.id);
            });
        });
        window.addEventListener("scroll", updateCurrent, { passive: true });
        window.addEventListener("resize", updateCurrent);
    }

    // ---------- Startup ----------

    function renderAll(onOrgs) {
        S.load((s) => {
            settings = s;
            renderSettings();
        });
        chrome.storage.sync.get({ quickOrgs: [] }, (r) => {
            renderOrgs(r.quickOrgs || []);
            if (onOrgs) onOrgs();
        });
    }

    // The orgs list renders above later sections after load and pushes them
    // down, so jump to a linked section (e.g. settings.html#shortcuts, opened
    // after install when a shortcut is missing) once it's in.
    function scrollToHash() {
        const target = location.hash && document.getElementById(location.hash.slice(1));
        if (!target || !target.classList.contains("st-section")) return;
        clicked = target;
        target.scrollIntoView();
        setCurrent(target.id);
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync") return;
        // While our own write is pending, memory is newer than this event.
        if (changes.settings && saveTimer === null && !inFlight) {
            settings = S.normalize(changes.settings.newValue);
            renderSettings();
        }
        if (changes.quickOrgs && !inFlight) renderOrgs(changes.quickOrgs.newValue || []);
    });

    bindSettings();
    bindData();
    bindNav();
    $("search").addEventListener("input", applySearch);
    $("version").textContent = chrome.runtime.getManifest().version;
    // Pick up shortcut changes made in chrome://extensions/shortcuts.
    window.addEventListener("focus", renderShortcuts);
    // Don't lose a change made just before the page closes.
    window.addEventListener("pagehide", flushSettings);
    renderShortcuts();
    renderAll(scrollToHash);
})();
