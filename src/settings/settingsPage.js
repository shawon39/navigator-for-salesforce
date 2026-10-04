// settingsPage.js
// The full-page Settings screen (options page). Reads and writes the shared
// "settings" object (see src/shared/settings.js) and the saved orgs
// ("quickOrgs", see src/shared/orgs.js) and their tab colors ("orgColors", see
// src/shared/orgColors.js) in chrome.storage.sync, and re-renders when the
// popup changes them.
(function () {
    "use strict";

    const S = window.SFEN_SETTINGS;
    const O = window.SFEN_ORGS;
    const C = window.SFEN_ORG_COLORS;
    const U = window.SFEN_URL;
    const $ = (id) => document.getElementById(id);

    const TAB_KEYS = Object.keys(S.DEFAULTS.popupTabs);
    const EXPORT_KEYS = ["bookmarks", "sfTabs", "quickOrgs", "pinnedObjects", "orgColors", "settings"];
    const MAX_BOOKMARKS = 10; // same caps as the popup
    const MAX_ORGS = 50;
    const ENV_VARS = { production: "prod", sandbox: "sandbox", scratch: "scratch", developer: "dev", trailhead: "other" };
    const ICON_X =
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';

    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    let settings = S.normalize(null);
    let orgs = []; // saved orgs as last read or written
    let orgColors = {}; // stored tab colors by org key, as last read or written
    let orgsLoaded = false; // false until the saved orgs are first read
    let pickerKey = null; // org whose color picker is open
    let focusAfterRender = null; // selector to focus once the org rows are redrawn
    let colorsView = ""; // tab-colors switch + theme the org rows were last drawn for

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

    function resolvedTheme() {
        return S.resolveTheme(settings);
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
        // The org rows show color swatches (in the theme's shades) only while tab colors are on.
        if (orgsLoaded && colorsView !== settings.orgTabColors + resolvedTheme()) renderOrgs(orgs);

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
            sw.addEventListener("click", () => {
                updateSettings((s) => (s[sw.dataset.setting] = !s[sw.dataset.setting]));
                // Turning tab colors on saves every org's color, so removing an
                // org later never shifts the colors of the others.
                if (sw.dataset.setting === "orgTabColors" && settings.orgTabColors) {
                    writeColors((map) => Object.assign(map, C.assign(orgs, map)));
                }
            });
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
            if (settings.theme === "system") renderSettings();
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

    // Change the stored tab colors: read the latest map inside the write queue
    // (the popup also writes it), drop colors of orgs that are gone, apply the
    // change, write. Content scripts only read it.
    function writeColors(change) {
        if (!orgsLoaded) return; // pruning against an empty list would drop every color
        inFlight++;
        writeQueue = writeQueue.then(
            () =>
                new Promise((resolve) =>
                    chrome.storage.sync.get({ orgColors: {} }, (r) => {
                        const stored = (r && r.orgColors) || {};
                        const keys = new Set(orgs.map(C.keyOf));
                        const map = {};
                        Object.keys(stored).forEach((k) => {
                            if (keys.has(k) && C.isColor(stored[k])) map[k] = stored[k];
                        });
                        change(map);
                        chrome.storage.sync.set({ orgColors: map }, () => {
                            inFlight--;
                            const err = chrome.runtime.lastError;
                            if (err) showStatus("Couldn't save: " + err.message, true);
                            else orgColors = map;
                            renderOrgs(orgs);
                            resolve();
                        });
                    })
                )
        );
    }

    function pickColor(org, color) {
        const key = C.keyOf(org);
        const pick = (map) => {
            Object.assign(map, C.assign(orgs, map)); // keep the others where they are
            map[key] = color;
            return map;
        };
        // Show the pick at once; the write re-renders with what was stored.
        orgColors = pick(Object.assign({}, orgColors));
        pickerKey = null;
        focusAfterRender = `.st-swatch[data-key="${CSS.escape(key)}"]`;
        renderOrgs(orgs);
        writeColors(pick);
    }

    function resetColors() {
        if (!confirm("Give every org a new color, in list order? Colors you picked are replaced.")) return;
        pickerKey = null;
        writeColors((map) => {
            Object.keys(map).forEach((k) => delete map[k]);
            Object.assign(map, C.assign(orgs, {}));
        });
        showStatus("Colors reset.");
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

    // An org's color icon, in the shades of this page's theme.
    function orgTile(org, color, size) {
        return C.tile(color, C.initial(org), O.orgType(org) === "production", resolvedTheme() === "dark", size);
    }

    function swatchCell(org, color, name) {
        const cell = el("span", "st-org-color");
        const btn = el("button", "st-swatch");
        btn.type = "button";
        btn.dataset.key = C.keyOf(org);
        btn.setAttribute("aria-expanded", pickerKey === C.keyOf(org) ? "true" : "false");
        btn.setAttribute("aria-label", `Tab color for ${name}: ${C.PALETTE[color].label}`);
        btn.title = "Change color";
        btn.appendChild(orgTile(org, color, 24));
        btn.addEventListener("click", () => {
            pickerKey = pickerKey === C.keyOf(org) ? null : C.keyOf(org);
            focusAfterRender = pickerKey
                ? `.st-color-opt[data-color="${color}"]`
                : `.st-swatch[data-key="${CSS.escape(C.keyOf(org))}"]`;
            renderOrgs(orgs);
        });
        cell.appendChild(btn);
        return cell;
    }

    // Inline picker under an org's row: 12 icons showing the org's initial.
    // A dot marks colors other orgs use. Arrow keys move, Enter picks, Esc closes.
    function colorPicker(org, colors, name) {
        const key = C.keyOf(org);
        const panel = el("div", "st-color-picker");
        panel.setAttribute("role", "group");
        panel.setAttribute("aria-label", "Tab color for " + name);
        const head = el("div", "st-color-head");
        head.append(el("span", "st-color-title", "Tab color for " + name), el("span", "st-row-desc", "A dot marks colors other orgs use."));
        const opts = el("div", "st-color-opts");
        const usedBy = {};
        orgs.forEach((o) => {
            if (C.keyOf(o) !== key) (usedBy[colors[C.keyOf(o)]] = usedBy[colors[C.keyOf(o)]] || []).push(O.displayName(o));
        });
        const buttons = C.ORDER.map((color) => {
            const b = el("button", "st-color-opt" + (usedBy[color] ? " is-used" : ""));
            b.type = "button";
            b.dataset.color = color;
            const current = colors[key] === color;
            b.setAttribute("aria-pressed", current ? "true" : "false");
            b.tabIndex = current ? 0 : -1;
            const label = C.PALETTE[color].label + (usedBy[color] ? ", used by " + usedBy[color].join(", ") : "");
            b.setAttribute("aria-label", label);
            b.title = label;
            b.appendChild(orgTile(org, color, 28));
            b.addEventListener("click", () => pickColor(org, color));
            return b;
        });
        buttons.forEach((b, i) => {
            b.addEventListener("keydown", (e) => {
                const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: buttons.length - 1 }[e.key];
                if (e.key === "Escape") {
                    e.preventDefault();
                    pickerKey = null;
                    focusAfterRender = `.st-swatch[data-key="${CSS.escape(key)}"]`;
                    renderOrgs(orgs);
                    return;
                }
                if (next === undefined) return;
                e.preventDefault();
                const target = buttons[(next + buttons.length) % buttons.length];
                buttons.forEach((x) => (x.tabIndex = x === target ? 0 : -1));
                target.focus();
            });
        });
        opts.append(...buttons);
        panel.append(head, opts);
        return panel;
    }

    function orgRow(org, colors) {
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

        if (colors) row.append(swatchCell(org, colors[C.keyOf(org)], name));
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
        // Likewise keep focus on a swatch or picker icon.
        if (!focusAfterRender && active && $("orgList").contains(active)) {
            if (active.classList.contains("st-swatch")) focusAfterRender = `.st-swatch[data-key="${CSS.escape(active.dataset.key)}"]`;
            if (active.classList.contains("st-color-opt")) focusAfterRender = `.st-color-opt[data-color="${active.dataset.color}"]`;
        }

        const on = settings.orgTabColors;
        colorsView = on + resolvedTheme();
        const colors = on ? C.assign(orgs, orgColors) : null;
        if (!orgs.some((o) => C.keyOf(o) === pickerKey)) pickerKey = null;
        const rows = [];
        orgs.forEach((org) => {
            rows.push(orgRow(org, colors));
            if (on && C.keyOf(org) === pickerKey) rows.push(colorPicker(org, colors, O.displayName(org)));
        });
        const list = $("orgList");
        list.replaceChildren(...rows);
        $("orgCard").classList.toggle("has-colors", on);
        $("orgHead").hidden = orgs.length === 0;
        $("orgEmpty").hidden = orgs.length > 0;
        $("orgColorFoot").hidden = !on || orgs.length === 0;
        renderColorSample(colors);

        if (focusAfterRender) {
            const target = list.querySelector(focusAfterRender);
            focusAfterRender = null;
            if (target) target.focus();
        }

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

    // Three sample tab icons next to the switch: your first orgs, or examples.
    function renderColorSample(colors) {
        const sample = orgs.length
            ? orgs.slice(0, 3)
            : [{ host: "acme.my.salesforce.com" }, { host: "acme--uat.sandbox.my.salesforce.com", isSandbox: true }, { host: "acme--dev.sandbox.my.salesforce.com", isSandbox: true }];
        const map = colors || C.assign(sample, orgColors);
        $("tabColorSample").replaceChildren(...sample.map((o) => orgTile(o, map[C.keyOf(o)], 18)));
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
                orgColors: C.clean(data.orgColors) || {},
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
            if (!U.isOrgHost(host)) return null;
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
    const IMPORT_LABELS = { bookmarks: "Bookmarks", sfTabs: "Quick tabs", quickOrgs: "Orgs", pinnedObjects: "Pinned objects" };

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
                    if (k === "orgColors") return; // after the orgs, below
                    if (!Array.isArray(v)) return;
                    const good = v.map(CLEAN[k]).filter((x) => x !== null).slice(0, CAPS[k]);
                    // A list with entries but none valid is a broken file:
                    // keep the current list instead of emptying it.
                    if (v.length && !good.length) {
                        skipped += v.length;
                        return;
                    }
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
            // Say exactly what will be replaced, with counts, before writing.
            chrome.storage.sync.get(EXPORT_KEYS, (current) => {
                // Colors are keyed by org id, or by host for orgs saved before
                // ids existed (those get a new id on import, so match the host too).
                // A file without colors (an older export) leaves them as they are.
                const fileColors = C.clean(data.orgColors);
                if (fileColors) {
                    const target = next.quickOrgs || current.quickOrgs || [];
                    next.orgColors = {};
                    target.forEach((o) => {
                        const c = fileColors[C.keyOf(o)] || fileColors[o.host];
                        if (c) next.orgColors[C.keyOf(o)] = c;
                    });
                }
                const count = (list) => (Array.isArray(list) ? list.length : 0);
                const lines = Object.keys(IMPORT_LABELS)
                    .filter((k) => next[k])
                    .map((k) => `${IMPORT_LABELS[k]}: ${count(current[k])} now → ${next[k].length} from the file`);
                if (fileColors) lines.push("Tab colors: replaced by the file's colors");
                if (next.settings) lines.push("Settings: replaced by the file's settings");
                const note = skipped ? `\n\n${skipped} invalid item${skipped === 1 ? "" : "s"} will be skipped.` : "";
                if (!confirm("Import will replace:\n\n" + lines.join("\n") + note + "\n\nEverything else is kept.")) return;
                cancelSettingsSave(); // the file's settings win over an unsaved change
                writeSync(next, (ok) => {
                    if (ok) showStatus(`Imported ${kept} item${kept === 1 ? "" : "s"}, skipped ${skipped}.`);
                    renderAll();
                });
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
        if (!confirm("Delete everything Navigator stores, including bookmarks, orgs and settings, on every device synced to this Chrome profile? This can't be undone. Tip: Export first to keep a copy.")) return;
        cancelSettingsSave();
        // Queued after any pending write, so a late save can't bring data back.
        writeQueue = writeQueue.then(
            () =>
                new Promise((resolve) =>
                    chrome.storage.sync.clear(() => {
                        chrome.storage.local.clear(() => {
                            settings = S.normalize(null);
                            orgColors = {};
                            pickerKey = null;
                            renderSettings();
                            renderOrgs([]);
                            // applyTheme remembers the theme for themeBoot.js; forget it too.
                            try {
                                localStorage.removeItem("nvTheme");
                            } catch (e) {}
                            showStatus("All data cleared.");
                            resolve();
                        });
                    })
                )
        );
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
        $("resetColors").addEventListener("click", resetColors);
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
        chrome.storage.sync.get({ quickOrgs: [], orgColors: {} }, (r) => {
            orgColors = r.orgColors || {};
            orgsLoaded = true;
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
        if (changes.orgColors && !inFlight) orgColors = changes.orgColors.newValue || {};
        if (changes.quickOrgs && !inFlight) renderOrgs(changes.quickOrgs.newValue || []);
        else if (changes.orgColors && !inFlight) renderOrgs(orgs);
    });

    bindSettings();
    bindData();
    bindNav();
    $("search").addEventListener("input", () => {
        if (pickerKey) {
            pickerKey = null;
            renderOrgs(orgs); // also applies the search
        } else applySearch();
    });
    $("version").textContent = chrome.runtime.getManifest().version;
    // Pick up shortcut changes made in chrome://extensions/shortcuts.
    window.addEventListener("focus", renderShortcuts);
    // Don't lose a change made just before the page closes.
    window.addEventListener("pagehide", flushSettings);
    renderShortcuts();
    renderAll(scrollToHash);
})();
