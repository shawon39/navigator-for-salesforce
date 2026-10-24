// popupUI.js
// Tabbed popup controller: header org switcher, section tabs (Recent /
// Navigate / Objects / Orgs), unified search with keyboard selection, the
// dynamic object list, and the recent list. Reuses the background worker's
// authenticated Salesforce API access.
(function () {
    "use strict";

    const $ = (id) => document.getElementById(id);
    const { icon } = SFEN_UI;
    const IS_MAC = /Mac/i.test(navigator.platform || navigator.userAgent);

    let activeTab = null;
    let currentHost = "";
    let settings = SFEN_SETTINGS.DEFAULTS;
    let liveEnabled = true;
    let liveObjects = null; // [{api,label}]
    let objState = "idle"; // idle | loading | ready | error
    let bookmarks = [];
    let favorites = [];
    let recentRecords = [];
    let objMenuEl = null; // open kebab menu in the Objects tab, if any
    let pinned = []; // user-pinned object API names (sync-persisted), in pin order
    let currentTabName = "recent";

    // Static catalog data lives in popupCatalog.js (loaded first).
    const { SETUP_PAGES, OBJ_MENU_ITEMS, FALLBACK_OBJECTS } = window.SFEN_POPUP_CATALOG;

    const PLACEHOLDERS = {
        recent: "Search Setup and objects",
        navigate: "Search Setup and objects",
        objects: "Filter objects",
        orgs: "Search orgs",
    };

    function ask(action, extra) {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage(
                    { type: "palette", action, host: currentHost, ...(extra || {}) },
                    (resp) => {
                        if (chrome.runtime.lastError || !resp || !resp.ok) resolve(null);
                        else resolve(resp);
                    }
                );
            } catch (e) {
                resolve(null);
            }
        });
    }

    // Absolute URL for a path on the current org — used both to navigate and as
    // the real <a href> so context-menu / middle-click / ⌘-click open the
    // Salesforce page instead of popup.html. Anything but a plain path (e.g. an
    // absolute URL from stored data) falls back to the org's root.
    function absUrl(path) {
        return `https://${currentHost}${SFEN_URL.isSafePath(path) ? path : "/"}`;
    }

    function navTo(path, newTab, meta) {
        // Record setup destinations for "Recent Setup" (the guard inside
        // SFEN_RECENTS.record drops non-setup URLs, so passing meta is safe).
        if (meta && window.SFEN_RECENTS) {
            SFEN_RECENTS.record({ label: meta.label, hint: meta.hint, flow: meta.flow, url: path }, currentHost);
        }
        const url = absUrl(path);
        if (newTab || !activeTab) {
            chrome.tabs.create({ url });
        } else {
            chrome.tabs.update(activeTab.id, { url });
            if (settings.autoClose) window.close();
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
        );
    }

    // Escaped label with the first literal match of the query in <mark>.
    function markText(label, query) {
        const i = query ? label.toLowerCase().indexOf(query) : -1;
        if (i < 0) return escapeHtml(label);
        return (
            escapeHtml(label.slice(0, i)) +
            "<mark>" + escapeHtml(label.slice(i, i + query.length)) + "</mark>" +
            escapeHtml(label.slice(i + query.length))
        );
    }

    // "Account — Fields" -> "Account / Fields" with a muted slash.
    function pathLabel(label) {
        return label
            .split(" — ")
            .map(escapeHtml)
            .join(' <span class="nv-row-sep">/</span> ');
    }

    // A navigable list row: <a class="nv-row"> with a real href; plain
    // left-clicks navigate this tab, modifier clicks open a new one.
    function linkRow(opts) {
        const a = document.createElement("a");
        a.className = "nv-row" + (opts.tall ? " is-tall" : "");
        a.href = absUrl(opts.url);
        a.innerHTML =
            icon(opts.icon) +
            `<span class="nv-row-label">${opts.html}</span>` +
            (opts.meta ? '<span class="nv-row-meta"></span>' : "") +
            `<span class="nv-row-enter" aria-hidden="true">${icon("enter", 14, 2)}</span>`;
        if (opts.meta) a.querySelector(".nv-row-meta").textContent = opts.meta;
        a.addEventListener("click", (e) => {
            if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                navTo(opts.url, false, opts.record);
            }
        });
        return a;
    }

    function groupLabel(text, gap, count) {
        const g = document.createElement("div");
        g.className = "nv-group" + (gap ? " nv-group-gap" : "") + (count != null ? " nv-group-spread" : "");
        g.textContent = text;
        if (count != null) {
            const c = document.createElement("span");
            c.className = "nv-group-count";
            c.textContent = count;
            g.appendChild(c);
        }
        return g;
    }

    // ---- Keyboard selection ----------------------------------------------
    function visibleMain() {
        return Array.from(document.querySelectorAll("body > main")).find((m) => !m.hidden);
    }

    function selectableRows() {
        const main = visibleMain();
        if (!main) return [];
        return Array.from(main.querySelectorAll(".nv-row")).filter(
            (r) => !r.classList.contains("is-editing") && !r.classList.contains("is-confirm")
        );
    }

    function setSelection(index) {
        const rows = selectableRows();
        rows.forEach((r, i) => r.classList.toggle("is-sel", i === index));
        if (rows[index]) rows[index].scrollIntoView({ block: "nearest" });
        // Search result rows have ids; tell assistive tech which one is selected.
        const sel = rows[index];
        if (sel && sel.id) $("popupSearch").setAttribute("aria-activedescendant", sel.id);
        else $("popupSearch").removeAttribute("aria-activedescendant");
    }

    function moveSelection(delta) {
        const rows = selectableRows();
        if (!rows.length) return;
        const cur = rows.findIndex((r) => r.classList.contains("is-sel"));
        const next = cur < 0 ? (delta > 0 ? 0 : rows.length - 1) : (cur + delta + rows.length) % rows.length;
        setSelection(next);
    }

    function openSelection(newTab) {
        const row = selectableRows().find((r) => r.classList.contains("is-sel"));
        if (!row) return false;
        const link = row.matches("a[href]") ? row : row.querySelector("a[href]");
        // A row offering to save an org has no link: Enter adds it.
        const add = link ? null : row.querySelector(".nv-btn-add");
        if (add) add.click();
        if (!link) return !!add;
        if (newTab) chrome.tabs.create({ url: link.href });
        else link.click();
        return true;
    }

    function onKeydown(e) {
        if (e.key === "Escape") closeObjMenu();
        const t = e.target;
        const typing = t.tagName === "INPUT" && t.id !== "popupSearch";
        if (typing || document.body.classList.contains("is-adding")) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            moveSelection(e.key === "ArrowDown" ? 1 : -1);
        } else if (e.key === "Enter" && t.id === "popupSearch") {
            if (openSelection(e.metaKey || e.ctrlKey)) e.preventDefault();
        }
    }

    // ---- Fuzzy search ----------------------------------------------------
    function objectSource() {
        return liveObjects && liveObjects.length
            ? liveObjects
            : FALLBACK_OBJECTS.map((n) => ({ api: n, label: n })).sort((a, b) => a.label.localeCompare(b.label));
    }

    // Objects from installed packages carry a namespace prefix (npsp__Foo__c).
    const isPackageObject = (o) => !!SFEN_URL.namespaceOf(o.api);

    // Under the list: how many package objects it hides, and a way to show
    // them without going to Settings (it turns the same setting on).
    function packageNote(count) {
        const note = document.createElement("div");
        note.className = "nv-footnote";
        note.append(`${count} object${count === 1 ? "" : "s"} from installed packages hidden. Search finds them. `);
        const show = document.createElement("button");
        show.type = "button";
        show.className = "nv-btn-link";
        show.textContent = "Show them";
        show.addEventListener("click", () => {
            settings = { ...settings, showManaged: true };
            renderObjects($("popupSearch").value);
            chrome.storage.sync.get(["settings"], (r) => {
                const next = { ...SFEN_SETTINGS.normalize(r && r.settings), showManaged: true };
                chrome.storage.sync.set({ settings: next }, () => void chrome.runtime.lastError);
            });
        });
        note.appendChild(show);
        return note;
    }

    const SEARCH_GROUPS = [
        ["object", "Objects"],
        ["setup", "Setup"],
        ["tab", "Setup quick tabs"],
        ["bookmark", "Bookmarks"],
        ["record", "Recently viewed"],
    ];

    function searchCatalog() {
        const items = [];
        objectSource().forEach((o) =>
            items.push({ kind: "object", label: o.label, api: o.api, keywords: o.api, url: `/lightning/o/${o.api}/home` })
        );
        SETUP_PAGES.forEach(([label, url]) => items.push({ kind: "setup", label, url }));
        // Stored entries whose link isn't a path on this org are skipped.
        favorites.forEach((f) => SFEN_URL.isSafePath(f.link) && items.push({ kind: "tab", label: f.name, url: f.link }));
        bookmarks.forEach((b) => SFEN_URL.isSafePath(b.url) && items.push({ kind: "bookmark", label: b.title, url: b.url }));
        recentRecords.forEach((r) => {
            const type = r.attributes ? r.attributes.type : "Record";
            items.push({ kind: "record", label: r.Name || r.Id, type, keywords: type, url: `/lightning/r/${type}/${r.Id}/view` });
        });
        return items;
    }

    function objectResultRow(item, query) {
        const row = document.createElement("div");
        row.className = "nv-row is-tall has-actions";
        row.setAttribute("role", "option");
        const link = document.createElement("a");
        link.className = "nv-row-link";
        link.href = absUrl(item.url);
        link.innerHTML =
            icon("box") +
            `<span class="nv-row-text"><span class="nv-row-label">${markText(item.label, query)}</span>` +
            `<span class="nv-row-sub nv-mono"></span></span>`;
        link.querySelector(".nv-row-sub").textContent = item.api;
        const meta = (what) => ({ label: `${item.label} — ${what}`, hint: what });
        link.addEventListener("click", (e) => {
            if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                navTo(item.url, false, meta("List"));
            }
        });
        row.appendChild(link);
        row.appendChild(objectActions({ api: item.api, label: item.label }, true));
        return row;
    }

    // ---- Search UI -------------------------------------------------------
    function runSearch(q) {
        const results = $("searchResults");
        const query = q.trim().toLowerCase();
        $("searchClear").hidden = !q;
        document.body.classList.toggle("is-searching", !!query);
        $("popupSearch").removeAttribute("aria-activedescendant");
        if (!query) {
            results.hidden = true;
            showPanel(currentTabName);
            return;
        }
        document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = true));
        results.hidden = false;

        const byKind = {};
        for (const item of searchCatalog()) {
            const sc = SFEN_URL.matchScore(query, item.label, item.keywords);
            if (sc >= 0) (byKind[item.kind] = byKind[item.kind] || []).push({ item, sc });
        }
        results.innerHTML = "";
        let shown = 0;
        SEARCH_GROUPS.forEach(([kind, title]) => {
            const list = (byKind[kind] || []).sort((a, b) => b.sc - a.sc).slice(0, kind === "setup" ? 6 : 4);
            if (!list.length) return;
            results.appendChild(groupLabel(title, shown > 0));
            list.forEach(({ item }) => {
                const row =
                    kind === "object"
                        ? objectResultRow(item, query)
                        : linkRow({
                              icon: { setup: "wrench", tab: "panel", bookmark: "bookmark", record: "file" }[kind],
                              html: markText(item.label, query),
                              url: item.url,
                              meta: kind === "record" ? item.type : "",
                              record: kind === "record" ? null : { label: item.label, hint: title },
                          });
                row.setAttribute("role", "option");
                row.id = "result-" + shown;
                results.appendChild(row);
                shown++;
            });
        });

        if (!shown) {
            results.innerHTML =
                '<div class="nv-empty"><div class="nv-empty-body">' +
                icon("search", 26, 1.6) +
                '<span class="nv-empty-title"></span>' +
                '<span class="nv-empty-text">Search looks through Setup, objects, your bookmarks and recently viewed records. Try fewer words.</span>' +
                "</div></div>";
            results.querySelector(".nv-empty-title").textContent = `No matches for “${q.trim()}”`;
            return;
        }
        const foot = document.createElement("div");
        foot.className = "nv-result-foot";
        foot.innerHTML = `${shown} result${shown === 1 ? "" : "s"} · <b>↵</b> open · <b>${IS_MAC ? "⌘↵" : "Ctrl+↵"}</b> new tab`;
        results.appendChild(foot);
        setSelection(0);
    }

    function onSearchInput(value) {
        if (currentTabName === "objects") return renderObjects(value);
        if (currentTabName === "orgs") return filterOrgs(value);
        runSearch(value);
    }

    // Filter the Orgs list and select the first match so Enter opens it.
    function filterOrgs(value) {
        SFEN_ORGS_TAB.filter(value);
        if (value.trim()) setSelection(0);
    }

    // ---- Tabs ------------------------------------------------------------
    function showPanel(name) {
        document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = p.id !== "tab-" + name));
    }

    function setActiveTabUI(name) {
        currentTabName = name;
        document.querySelectorAll(".nv-tab").forEach((t) => {
            t.setAttribute("aria-selected", String(t.dataset.tab === name));
            t.tabIndex = t.dataset.tab === name ? 0 : -1; // roving tabindex
        });
        showPanel(name);
        $("tabAddOrg").hidden = name !== "orgs";
        $("popupSearch").placeholder = PLACEHOLDERS[name];
        $("popupSearch").setAttribute("aria-label", PLACEHOLDERS[name]);
    }

    function loadTabData(name) {
        if (name === "objects") loadObjects();
        if (name === "recent") loadRecent();
    }

    function switchTab(name) {
        // Leaving search/filter when a tab is chosen.
        if ($("popupSearch").value) {
            $("popupSearch").value = "";
            onSearchInput("");
        }
        closeObjMenu();
        setActiveTabUI(name);
        if (name === "orgs") SFEN_ORGS_TAB.filter("");
        try {
            chrome.storage.local.set({ popupTab: name });
        } catch (e) {}
        loadTabData(name);
    }

    function wireTabs() {
        document.querySelectorAll(".nv-tab").forEach((t) => {
            t.hidden = !settings.popupTabs[t.dataset.tab];
            t.addEventListener("click", () => switchTab(t.dataset.tab));
        });
        // Left/Right/Home/End move between the visible tabs.
        document.querySelector(".nv-tabs").addEventListener("keydown", (e) => {
            const tabs = Array.from(document.querySelectorAll(".nv-tab")).filter((t) => !t.hidden);
            const i = tabs.indexOf(e.target);
            const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: tabs.length - 1 }[e.key];
            if (i < 0 || next === undefined) return;
            e.preventDefault();
            const tab = tabs[(next + tabs.length) % tabs.length];
            tab.focus();
            switchTab(tab.dataset.tab);
        });
    }

    // ---- Header org switcher -------------------------------------------
    function updateOrgSwitch() {
        const btn = $("orgSwitch");
        const saved = SFEN_ORGS_TAB.find(currentHost);
        const org = saved || { host: currentHost };
        const type = SFEN_ORGS.orgType(org);
        const name = saved ? SFEN_ORGS.displayName(saved) : SFEN_ORGS.defaultName(currentHost);
        const mark = SFEN_ORGS_TAB.marker(org, 14);
        mark.classList.add("nv-org-mark");
        btn.querySelector(".nv-org-mark").replaceWith(mark);
        btn.querySelector(".nv-org-switch-name").textContent = name;
        const action = settings.popupTabs.orgs ? ". Switch org" : saved ? "" : ". Add this org";
        btn.setAttribute("aria-label", `Current org: ${name}, ${SFEN_ORGS.TYPES[type].toLowerCase()}${action}`);
        btn.hidden = !currentHost;
    }

    // ---- Objects tab -----------------------------------------------------
    function loadObjects(force) {
        if (objState !== "idle" && !force) {
            renderObjects($("popupSearch").value);
            return;
        }
        if (!liveEnabled) {
            objState = "ready";
            renderObjects($("popupSearch").value);
            return;
        }
        objState = "loading";
        renderObjects($("popupSearch").value);
        ask("objects").then((resp) => {
            if (!resp) {
                objState = "error";
                renderObjects($("popupSearch").value);
                return;
            }
            liveObjects = (resp.sobjects || [])
                .filter(
                    (s) =>
                        s.queryable &&
                        s.layoutable &&
                        s.keyPrefix &&
                        !s.deprecatedAndHidden &&
                        !/(ChangeEvent|__Share|__History|__Feed|__Tag|Share|History|Feed|__e|__mdt|__b|__x)$/.test(s.name)
                )
                .map((s) => ({ api: s.name, label: s.label }))
                .sort((a, b) => a.label.localeCompare(b.label));
            objState = "ready";
            renderObjects($("popupSearch").value);
        });
    }

    // New / Fields / ⋯ buttons for an object row (List is the row itself);
    // search results also get a List button since they sit among other kinds.
    function objectActions(o, withList) {
        const acts = document.createElement("span");
        acts.className = "nv-row-actions";
        const mk = (text, path) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "nv-btn-link";
            b.textContent = text;
            b.addEventListener("click", (e) =>
                navTo(path, e.metaKey || e.ctrlKey, { label: `${o.label} — ${text}`, hint: text })
            );
            acts.appendChild(b);
        };
        if (withList) mk("List", `/lightning/o/${o.api}/home`);
        mk("New", `/lightning/o/${o.api}/new?useRecordTypeCheck=1`);
        mk("Fields", `/lightning/setup/ObjectManager/${o.api}/FieldsAndRelationships/view`);
        if (!withList) {
            const kebab = document.createElement("button");
            kebab.type = "button";
            kebab.className = "nv-icon-btn nv-act-more";
            kebab.title = "More";
            kebab.setAttribute("aria-label", `More ${o.label} pages`);
            kebab.setAttribute("aria-expanded", "false");
            kebab.innerHTML = icon("more", 15, 2);
            kebab.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleObjMenu(kebab, o);
            });
            acts.appendChild(kebab);
        }
        return acts;
    }

    function objectRow(o) {
        const row = document.createElement("div");
        row.className = "nv-row has-actions";
        row.dataset.api = o.api;
        const link = document.createElement("a");
        link.className = "nv-row-link";
        link.href = absUrl(`/lightning/o/${o.api}/home`);
        link.innerHTML = icon("box") + '<span class="nv-row-label"></span>';
        const label = link.querySelector(".nv-row-label");
        label.textContent = o.label;
        if (o.label !== o.api) {
            const api = document.createElement("span");
            api.className = "nv-mono";
            api.textContent = o.api;
            label.appendChild(api);
        }
        link.addEventListener("click", (e) => {
            if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                navTo(`/lightning/o/${o.api}/home`, false, { label: `${o.label} — List`, hint: "List" });
            }
        });
        row.appendChild(link);
        row.appendChild(objectActions(o, false));
        return row;
    }

    function renderObjects(filter) {
        const list = $("objectList");
        const q = (filter || "").trim().toLowerCase();
        const pinnedSet = new Set(pinned);
        list.innerHTML = "";

        if (objState === "error") {
            const banner = document.createElement("div");
            banner.className = "nv-banner";
            banner.setAttribute("role", "status");
            banner.innerHTML =
                icon("info") +
                "<span>Couldn't load this org's objects. Showing standard objects for now.</span>" +
                '<button type="button" class="nv-btn-link">Retry</button>';
            banner.querySelector("button").addEventListener("click", () => loadObjects(true));
            list.appendChild(banner);
        }

        // Before the live list arrives, pinned objects show by API name.
        const known = new Map(objectSource().map((o) => [o.api, o]));
        if (objState === "loading") pinned.forEach((api) => known.has(api) || known.set(api, { api, label: api }));
        const all = Array.from(known.values());

        // The list hides objects from installed packages unless the setting is
        // on (pins always show). A search finds them too, after the org's own.
        const visible = q ? all : all.filter((o) => pinnedSet.has(o.api) || settings.showManaged || !isPackageObject(o));
        const matched = visible
            .filter((o) => !q || (o.label + " " + o.api).toLowerCase().includes(q))
            .sort((a, b) => (q ? isPackageObject(a) - isPackageObject(b) : 0));

        // Pinned objects float to the top in pin order; everything else follows.
        const pinnedRows = matched
            .filter((o) => pinnedSet.has(o.api))
            .sort((a, b) => pinned.indexOf(a.api) - pinned.indexOf(b.api));
        const rest = matched.filter((o) => !pinnedSet.has(o.api));

        if (!q && pinnedRows.length) list.appendChild(groupLabel("Pinned"));
        pinnedRows.forEach((o) => list.appendChild(objectRow(o)));

        if (objState === "loading") {
            const status = document.createElement("div");
            status.className = "nv-group nv-loading" + (pinnedRows.length ? " nv-group-gap" : "");
            status.setAttribute("role", "status");
            status.innerHTML = '<span class="nv-spinner"></span>Loading objects…';
            list.appendChild(status);
            [36, 28, 44, 32, 40].forEach((w) => {
                const sk = document.createElement("div");
                sk.className = "nv-skeleton";
                sk.innerHTML = `<span></span><span style="width:${w}%"></span>`;
                list.appendChild(sk);
            });
            list.setAttribute("aria-busy", "true");
            return;
        }
        list.removeAttribute("aria-busy");

        if (!matched.length) {
            list.appendChild(Object.assign(document.createElement("div"), {
                className: "nv-note",
                textContent: q ? `No objects match “${filter.trim()}”` : "No objects",
            }));
            return;
        }
        if (!q && rest.length) {
            const title = liveObjects && liveObjects.length ? "All objects" : "Standard objects";
            list.appendChild(groupLabel(title, pinnedRows.length > 0, rest.length));
        }
        rest.slice(0, 200).forEach((o) => list.appendChild(objectRow(o)));
        if (!q && visible.length < all.length) list.appendChild(packageNote(all.length - visible.length));
        // Select the first match so Enter opens it.
        if (q && currentTabName === "objects") setSelection(0);
    }

    function togglePin(api) {
        pinned = pinned.includes(api)
            ? pinned.filter((a) => a !== api)
            : [...pinned, api];
        try {
            chrome.storage.sync.set({ pinnedObjects: pinned }, () => {
                if (!chrome.runtime.lastError) return;
                // Show what's actually stored, not the pins that failed to save.
                SFEN_UI.toast("Couldn't save: " + chrome.runtime.lastError.message);
                chrome.storage.sync.get(["pinnedObjects"], (res) => {
                    pinned = res.pinnedObjects || [];
                    renderObjects($("popupSearch").value);
                });
            });
        } catch (e) {}
        renderObjects($("popupSearch").value);
    }

    function closeObjMenu() {
        if (objMenuEl) {
            const row = document.querySelector(".nv-row.menu-open");
            if (row) {
                row.classList.remove("menu-open");
                row.querySelector(".nv-act-more").setAttribute("aria-expanded", "false");
            }
            objMenuEl.remove();
            objMenuEl = null;
        }
    }

    function toggleObjMenu(btn, o) {
        if (objMenuEl && objMenuEl.dataset.api === o.api) {
            closeObjMenu();
            return;
        }
        closeObjMenu();
        const menu = document.createElement("div");
        menu.className = "nv-menu";
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", `${o.label} pages`);
        menu.dataset.api = o.api;
        const item = (label, path, record) => {
            const a = document.createElement("a");
            a.className = "nv-menu-item";
            a.setAttribute("role", "menuitem");
            a.href = absUrl(path);
            a.textContent = label;
            a.addEventListener("click", (e) => {
                if (e.button !== 0 || e.shiftKey) return;
                e.preventDefault();
                closeObjMenu();
                navTo(path, e.metaKey || e.ctrlKey, record);
            });
            menu.appendChild(a);
        };
        OBJ_MENU_ITEMS.forEach(([label, suffix]) =>
            item(label, `/lightning/setup/ObjectManager/${o.api}${suffix}`, {
                label: `${o.label} — ${label}`,
                hint: "Setup",
            })
        );
        menu.appendChild(Object.assign(document.createElement("div"), { className: "nv-menu-sep" }));
        const pin = document.createElement("button");
        pin.type = "button";
        pin.className = "nv-menu-item";
        pin.setAttribute("role", "menuitem");
        pin.textContent = `${pinned.includes(o.api) ? "Unpin" : "Pin"} ${o.label}`;
        pin.addEventListener("click", () => {
            closeObjMenu();
            togglePin(o.api);
        });
        menu.appendChild(pin);
        item("Open in Object Manager", `/lightning/setup/ObjectManager/${o.api}/Details/view`, {
            label: `${o.label} — Object Manager`,
            hint: "Setup",
        });

        document.body.appendChild(menu);
        objMenuEl = menu;
        const row = btn.closest(".nv-row");
        row.classList.add("menu-open");
        btn.setAttribute("aria-expanded", "true");
        // Fixed-position so it isn't clipped by the scrolling list; align its
        // right edge to the kebab and flip above if it would overflow the popup.
        const r = btn.getBoundingClientRect();
        const left = Math.max(6, r.right - menu.offsetWidth);
        let top = r.bottom + 4;
        if (top + menu.offsetHeight > window.innerHeight - 6)
            top = Math.max(6, r.top - 4 - menu.offsetHeight);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.querySelector(".nv-menu-item").focus();
        // Up/Down move between items; Escape closes and returns to the kebab.
        menu.addEventListener("keydown", (e) => {
            const items = Array.from(menu.querySelectorAll(".nv-menu-item"));
            const i = items.indexOf(document.activeElement);
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
            } else if (e.key === "Escape") {
                closeObjMenu();
                btn.focus();
            } else return;
            e.preventDefault();
            e.stopPropagation(); // keep the list's row selection out of it
        });
    }

    // ---- Recent tab ------------------------------------------------------
    let recentLoaded = false;
    let recentSetup = [];
    function loadRecent() {
        SFEN_RECENTS.load(currentHost, (list) => {
            recentSetup = list;
            renderRecent();
            // Recent Flow links open the version that was latest when they
            // were saved; move them to the current one.
            const flowIds = SFEN_RECENTS.flowIds(list);
            if (!liveEnabled || !flowIds.length) return;
            ask("flowVersions", { flowIds }).then((resp) => {
                const updated = resp && SFEN_RECENTS.updateFlows(currentHost, resp.versions);
                if (!updated) return;
                recentSetup = updated;
                renderRecent();
            });
        });
        if (recentLoaded || !liveEnabled) return;
        ask("recent").then((resp) => {
            if (resp) recentLoaded = true; // retry next time if it failed
            recentRecords = (resp && resp.records) || [];
            renderRecent();
        });
    }

    function renderRecent() {
        const setupList = $("recentSetup");
        const list = $("recentList");
        setupList.innerHTML = "";
        list.innerHTML = "";

        const setupItems = recentSetup.filter((it) => SFEN_URL.isSafePath(it.url)).slice(0, 7);
        $("recentSetupLabel").hidden = !setupItems.length;
        setupItems.forEach((it) => {
            const label = it.label || it.url;
            setupList.appendChild(
                linkRow({
                    icon: label.includes(" — ") ? "box" : "wrench",
                    html: pathLabel(label),
                    url: it.url,
                    record: { label: it.label, hint: it.hint, flow: it.flow },
                })
            );
        });

        const recordItems = recentRecords.slice(0, 20);
        $("recentRecordsLabel").hidden = !recordItems.length;
        $("recentRecordsLabel").classList.toggle("nv-group-gap", !!setupItems.length);
        recordItems.forEach((r) => {
            const type = r.attributes ? r.attributes.type : "Record";
            list.appendChild(
                linkRow({ icon: "file", html: escapeHtml(r.Name || r.Id), meta: type, url: `/lightning/r/${type}/${r.Id}/view` })
            );
        });

        $("recentEmpty").hidden = !!(setupItems.length || recordItems.length);
        if (currentTabName === "recent" && !$("popupSearch").value) setSelection(0);
    }

    // ---- Init ------------------------------------------------------------
    async function init() {
        const ready = await window.SFEN_POPUP_READY;
        settings = ready.settings;
        liveEnabled = settings.liveOrgAccess;
        activeTab = ready.tab;
        // tab.url is undefined off Salesforce (no host access): no current org.
        currentHost = ready.isSalesforce ? new URL(activeTab.url).hostname : "";

        const search = $("popupSearch");
        $("searchClear").addEventListener("click", () => {
            search.value = "";
            search.dispatchEvent(new Event("input"));
            search.focus();
        });
        if (!IS_MAC) document.querySelectorAll(".nv-empty-tip b").forEach((b) => (b.textContent = "Alt+K"));

        if (!ready.isSalesforce) {
            // popup.js built the off-Salesforce screen; only the org list is live.
            search.addEventListener("input", (e) => {
                $("searchClear").hidden = !e.target.value;
                filterOrgs(e.target.value);
            });
            $("headerAddOrg").addEventListener("click", SFEN_ORGS_TAB.openAdd);
            document.addEventListener("keydown", onKeydown);
            search.focus();
            return;
        }

        // Resolve the saved tab FIRST (fast local read) and paint it before the
        // slower reads below, then reveal — avoids the default tab flashing.
        const local = await new Promise((resolve) =>
            chrome.storage.local.get({ popupTab: "recent" }, (r) => resolve(r || {}))
        );
        const enabled = Object.keys(settings.popupTabs).filter((k) => settings.popupTabs[k]);
        let savedTab = local.popupTab === "login" ? "orgs" : local.popupTab;
        if (!enabled.includes(savedTab)) savedTab = enabled[0] || "recent";
        wireTabs();
        setActiveTabUI(savedTab);
        document.body.classList.remove("sfen-booting");

        await new Promise((resolve) =>
            chrome.storage.sync.get(["sfTabs", "bookmarks", "pinnedObjects"], (res) => {
                favorites = res.sfTabs || [];
                bookmarks = res.bookmarks || [];
                pinned = res.pinnedObjects || [];
                resolve();
            })
        );

        // Uses the list the Orgs tab loaded instead of a second read.
        initQuickLogin({ currentHost, currentUrl: activeTab.url }).then(updateOrgSwitch);
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "sync" && (changes.quickOrgs || changes.orgColors || changes.settings)) setTimeout(updateOrgSwitch);
        });
        // With the Orgs tab hidden, the org name is where an unsaved org is added.
        $("orgSwitch").addEventListener("click", () => {
            if (settings.popupTabs.orgs) switchTab("orgs");
            else if (!SFEN_ORGS_TAB.find(currentHost)) SFEN_ORGS_TAB.openAdd();
        });
        $("tabAddOrg").addEventListener("click", SFEN_ORGS_TAB.openAdd);

        const openSetup = $("recentOpenSetup");
        openSetup.href = absUrl("/lightning/setup/SetupOneHome/home");
        openSetup.addEventListener("click", (e) => {
            if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                navTo("/lightning/setup/SetupOneHome/home");
            }
        });

        search.addEventListener("input", (e) => onSearchInput(e.target.value));

        // Dismiss the object kebab menu on outside click or list scroll.
        document.addEventListener("click", (e) => {
            if (objMenuEl && !e.target.closest(".nv-menu") && !e.target.closest(".nv-act-more"))
                closeObjMenu();
        });
        document.addEventListener("keydown", onKeydown);
        $("tab-objects").addEventListener("scroll", closeObjMenu);

        // Now that host/liveEnabled are known, load the active tab's data.
        loadTabData(savedTab);
        search.focus();
    }

    document.addEventListener("DOMContentLoaded", init);
})();
