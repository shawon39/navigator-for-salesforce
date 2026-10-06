// commandPalette.js
// Option/Alt+K command palette for fast Salesforce navigation.
// Grouped fuzzy search over setup pages, objects, setup tabs, bookmarks, recents, and
// (when live org access is enabled) the org's objects + records via the
// background worker's authenticated API calls.
// Static data, icons, and pure helpers live in commandPalette.data.js (loaded
// first via the manifest) and are read from window.SFEN_CMDK_DATA below.
(function () {
    "use strict";

    // The manifest's matches already limit this script to Salesforce hosts.
    if (!extAlive()) return;
    const host = window.location.hostname;

    const {
        PALETTE_CSS,
        GROUPS,
        VERBS,
        SETUP_PAGES,
        FALLBACK_OBJECTS,
        isRelevantObject,
        objectEntries,
        objectScore,
        objectVerbEntries,
        PACKAGE_PENALTY,
        packageQuery,
        iconSvg,
        UI_ICONS,
        looksLikeRecordId,
        highlightPositions,
        escapeHtml,
        navigate,
        recordUrl,
    } = window.SFEN_CMDK_DATA;

    const DEFAULT_PLACEHOLDER =
        "Search Salesforce — objects, setup, records, bookmarks…";

    // ---- State -----------------------------------------------------------
    let staticCatalog = [];
    let liveObjects = null; // [{api,label,plural}] once fetched
    let liveRecords = []; // current async search results
    let recents = []; // persisted recently-chosen palette items
    let recentRecords = []; // org "recently viewed" records
    let liveEnabled = true;
    let paletteEnabled = true; // settings.commandPalette
    let objectsRequested = false;
    let adminItems = []; // profiles, permission sets, flows (fetched once)
    let adminRequested = false;
    let appItems = null; // the user's Lightning apps, in App Launcher order, once fetched
    let appsRequested = false;
    let fieldsCache = {}; // object API name -> [{api,label,type,key}] for the "fields" verb
    let fieldsFailed = {}; // object API names whose fields failed to load (retried on the next open)
    let fieldsKey = null; // object whose fields are being fetched; a response for another is ignored
    let catalogCache = null; // fullCatalog() result; reset when its sources change
    let currentQuery = ""; // last query passed to render()
    let expandedKey = null; // url of the row whose ⋯ actions are expanded
    let activeVerb = null; // active command verb key (VERBS), or null
    let autoVerbWord = null; // verb word as typed when "word " switched it on; null when locked
    let inspectKey = null; // "Type/Id" currently fetched for the record inspector
    let inspectRecord = null; // fetched record fields for the record inspector
    const describeCache = {}; // "host/Type" -> { fieldApiName: label } for the inspector
    let liveRecordsTerm = ""; // search term liveRecords were returned for
    let orgName = ""; // current org's saved or default name, shown in the search bar
    let orgKind = ""; // SFEN_ORGS.orgType of the current org (dot color)
    let savedOrgs = []; // saved orgs (quickOrgs), listed by the "org" verb
    let currentOrg = null; // the saved org this page belongs to, if any
    let tabColors = false; // settings.orgTabColors: org color icons instead of type dots
    let orgColorMap = Object.create(null); // org key -> color name (SFEN_ORG_COLORS.assign)
    let paletteDark = false; // the palette's resolved theme, for icon shades

    // Key hints: ⌘ on Mac, Ctrl elsewhere.
    const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl+";

    function buildStaticCatalog(cb) {
        if (!extAlive()) return;
        chrome.storage.sync.get(
            { sfTabs: [], bookmarks: [] },
            (res) => {
                if (chrome.runtime.lastError || !res) return;
                const items = [];
                SETUP_PAGES.forEach(([label, url, category]) => {
                    let keywords = `${label} ${category || ""} setup`;
                    if (label === "Users") keywords += " manage users list";
                    items.push({ label, hint: "Setup", group: GROUPS.SETUP, url, keywords });
                });
                (res.sfTabs || []).forEach((t) => {
                    if (t && t.name && SFEN_URL.isSafePath(t.link))
                        items.push({ label: t.name, hint: "Setup Tab", group: GROUPS.SETUP_TAB, url: t.link, keywords: `${t.name} setup tab` });
                });
                (res.bookmarks || []).forEach((b) => {
                    if (b && b.title && SFEN_URL.isSafePath(b.url))
                        items.push({ label: b.title, hint: "Bookmark", group: GROUPS.BOOKMARK, url: b.url, keywords: `${b.title} bookmark` });
                });
                staticCatalog = items;
                catalogCache = null;
                if (cb) cb();
            }
        );
    }

    function objectCatalog() {
        const items = [];
        const source =
            liveObjects && liveObjects.length
                ? liveObjects
                : FALLBACK_OBJECTS.map((n) => ({ api: n, label: n }));
        source.forEach((o) =>
            objectEntries(o.api, o.label).forEach((e) => items.push(e))
        );
        return items;
    }

    function fullCatalog() {
        if (!catalogCache) catalogCache = staticCatalog.concat(objectCatalog(), adminItems, appItems || []);
        return catalogCache;
    }

    // The empty-query state is the overview board (renderBoard); compute() only
    // handles the typed-search path.
    function compute(query) {
        const raw = query.trim();
        const q = raw.toLowerCase();
        const out = [];
        // Pasting a 15/18-char record Id jumps straight to that record.
        if (looksLikeRecordId(raw)) {
            out.push({ label: "Open record: " + raw, hint: "ID", group: GROUPS.ACTION, url: "/" + raw });
        }
        if (!q) return out;
        // Setup pages, setup tabs, and bookmarks are deliberate destinations, so
        // rank them above incidental object matches (e.g. "flows" -> Setup, not objects).
        const GROUP_BONUS = {
            [GROUPS.BOOKMARK]: 10,
            [GROUPS.SETUP_TAB]: 10,
            [GROUPS.SETUP]: 8,
            [GROUPS.APP]: 8,
            [GROUPS.OBJECT]: 0,
            [GROUPS.RECORD]: 0,
        };
        const scored = [];
        for (const item of fullCatalog()) {
            const itemQuery = packageQuery(item, q);
            if (itemQuery === null) continue;
            const sc = SFEN_URL.matchScore(itemQuery, item.label, item.keywords);
            if (sc >= 0)
                scored.push({ item, sc: sc + (GROUP_BONUS[item.group] || 0) - (item.pkg ? PACKAGE_PENALTY : 0) });
        }
        liveRecords.forEach((item) => {
            const sc = SFEN_URL.matchScore(q, item.label, item.keywords);
            // Records came back from a server search for this term; always
            // include them, but only boost the ones that match the query.
            scored.push({ item, sc: sc >= 0 ? sc + 6 : 0 });
        });
        scored.sort((a, b) => b.sc - a.sc);

        // Cap noisy groups so a flood of object matches can't crowd out the rest.
        const caps = {
            [GROUPS.OBJECT]: 6,
            [GROUPS.SETUP]: 12,
            [GROUPS.RECORD]: 8,
            [GROUPS.SETUP_TAB]: 8,
            [GROUPS.BOOKMARK]: 8,
            [GROUPS.FLOW]: 6,
            [GROUPS.PROFILE]: 6,
            [GROUPS.PERMSET]: 6,
            [GROUPS.APP]: 6,
            [GROUPS.APEX]: 6,
            [GROUPS.CMDT]: 4,
        };
        const counts = {};
        for (const s of scored) {
            const g = s.item.group;
            counts[g] = (counts[g] || 0) + 1;
            if (caps[g] && counts[g] > caps[g]) continue;
            out.push(s.item);
            if (out.length >= 24) break;
        }
        return out;
    }

    // ---- Live org access -------------------------------------------------
    function ask(action, extra, cb) {
        if (!extAlive()) {
            cb(null);
            return;
        }
        try {
            chrome.runtime.sendMessage(
                { type: "palette", action, host, ...extra },
                (resp) => {
                    if (chrome.runtime.lastError || !resp || !resp.ok) {
                        cb(null);
                        return;
                    }
                    cb(resp);
                }
            );
        } catch (e) {
            cb(null);
        }
    }

    function loadObjects() {
        if (!liveEnabled || objectsRequested) return;
        objectsRequested = true;
        ask("objects", {}, (resp) => {
            if (!resp || !liveEnabled) {
                objectsRequested = false; // retry on the next open
                return;
            }
            liveObjects = resp.sobjects
                .filter(isRelevantObject)
                .map((s) => ({ api: s.name, label: s.label, plural: s.labelPlural }));
            catalogCache = null;
            if (opened) render(inputEl.value);
        });
    }

    // Profiles, permission sets, flows, Apex classes and triggers, and custom
    // metadata types — fetched once, fuzzy-searched like objects. Each carries
    // a hint so the result type is obvious.
    function loadAdmin() {
        if (!liveEnabled || adminRequested) return;
        adminRequested = true;
        ask("admin", {}, (resp) => {
            if (!resp || !liveEnabled) {
                adminRequested = false;
                return;
            }
            const profiles = (resp.profiles || []).map((p) => ({
                label: p.Name,
                hint: "Profile",
                group: GROUPS.PROFILE,
                url: `/lightning/setup/EnhancedProfiles/page?address=%2F${p.Id}`,
                keywords: `${p.Name || ""} profile`,
            }));
            const permSets = (resp.permissionSets || []).map((p) => ({
                label: p.Label || p.Name,
                hint: "Permission Set",
                group: GROUPS.PERMSET,
                url: `/lightning/setup/PermSets/page?address=%2F${p.Id}`,
                keywords: `${p.Label || ""} ${p.Name || ""} permission set permset`,
            }));
            const flows = (resp.flows || []).map((f) => ({
                label: f.Label || f.ApiName,
                hint: "Flow",
                group: GROUPS.FLOW,
                // Flow Builder opens a flow VERSION (301), not the definition (300).
                // Prefer the latest version (matches the Setup list's behavior),
                // then the active version, then fall back to the definition id.
                url: `/builder_platform_interaction/flowBuilder.app?flowId=${f.LatestVersionId || f.ActiveVersionId || f.DurableId}`,
                flow: f.DurableId, // lets Recent Setup follow newer versions
                keywords: `${f.Label || ""} ${f.ApiName || ""} flow ${f.ProcessType || ""}`,
            }));
            const apex = (resp.apexClasses || [])
                .map((c) => ({
                    label: c.Name,
                    hint: c.NamespacePrefix ? `Apex Class · ${c.NamespacePrefix}` : "Apex Class",
                    group: GROUPS.APEX,
                    pkg: c.NamespacePrefix || null, // hidden unless the query names the package
                    url: `/lightning/setup/ApexClasses/page?address=%2F${c.Id}`,
                    keywords: `${c.Name} ${c.NamespacePrefix || ""} apex class code`,
                }))
                .concat(
                    (resp.apexTriggers || []).map((t) => ({
                        label: t.Name,
                        hint: ["Apex Trigger", t.Object, t.NamespacePrefix].filter(Boolean).join(" · "),
                        group: GROUPS.APEX,
                        pkg: t.NamespacePrefix || null,
                        url: `/lightning/setup/ApexTriggers/page?address=%2F${t.Id}`,
                        keywords: `${t.Name} ${t.Object || ""} ${t.NamespacePrefix || ""} apex trigger code`,
                    }))
                );
            const metadataTypes = (resp.metadataTypes || []).map((m) => ({
                label: m.Label,
                api: m.Label !== m.ApiName ? m.ApiName : "",
                hint: "Custom Metadata Type",
                group: GROUPS.CMDT,
                url: `/lightning/setup/CustomMetadata/page?address=%2F${m.Id}%3Fsetupid%3DCustomMetadata`,
                keywords: `${m.Label} ${m.ApiName} custom metadata type cmdt`,
                actions: m.KeyPrefix
                    ? [{ label: "Manage records", hint: "Records", kind: "nav", url: `/lightning/setup/CustomMetadata/page?address=%2F${m.KeyPrefix}` }]
                    : null,
            }));
            adminItems = profiles.concat(permSets, flows, apex, metadataTypes);
            catalogCache = null;
            if (opened && inputEl.value.trim()) render(inputEl.value);
        });
    }

    // The user's Lightning apps — fetched once, searched like admin items and
    // listed by the "app" verb.
    function loadApps() {
        if (!liveEnabled || appsRequested) return;
        appsRequested = true;
        ask("apps", {}, (resp) => {
            if (!resp || !liveEnabled) {
                appsRequested = false;
                if (opened && activeVerb) render(inputEl.value);
                return;
            }
            appItems = (resp.apps || []).map((a) => ({
                label: a.label,
                hint: a.console ? "Console app" : "App",
                group: GROUPS.APP,
                url: `/lightning/app/${a.id}`,
                keywords: `${a.label} app${a.console ? " console" : ""}`,
            }));
            catalogCache = null;
            if (opened && (activeVerb || inputEl.value.trim())) render(inputEl.value);
        });
    }

    // One object's fields for the "fields" verb, cached for the page's life.
    function loadFields(api) {
        if (fieldsCache[api] || fieldsFailed[api] || fieldsKey === api) return;
        fieldsKey = api;
        setLoading("fields", true);
        ask("fields", { object: api }, (resp) => {
            if (fieldsKey !== api) return; // stale: another object, or the verb was cleared
            fieldsKey = null;
            setLoading("fields", false);
            if (resp) fieldsCache[api] = resp.fields || [];
            else fieldsFailed[api] = true;
            if (opened && activeVerb === "fields") render(inputEl.value);
        });
    }

    // ---- Record -> palette item ------------------------------------------
    function userSub(r) {
        const parts = [];
        if (r.ProfileName) parts.push(r.ProfileName);
        if (r.IsActive === false) parts.push("Inactive");
        else if (r.IsActive === true) parts.push("Active");
        if (r.Username) parts.push("@" + r.Username);
        return parts.join(" · ");
    }

    function userActions(id) {
        return [
            { label: "Login as — new tab", hint: "Login", kind: "loginAs", userId: id, incognito: false },
            { label: "Login as — Incognito", hint: "Login", kind: "loginAs", userId: id, incognito: true },
            { label: "Copy User Id", hint: "Copy", kind: "copy", text: id },
            { label: "Manage in Setup", hint: "Setup", kind: "nav", url: recordUrl("User", id) },
        ];
    }

    function mapRecord(r) {
        const type = r.attributes ? r.attributes.type : "Record";
        const name = r.Name || r.CaseNumber || r.ContractNumber || r.OrderNumber || r.Id;
        const item = {
            label: name,
            hint: type,
            group: GROUPS.RECORD,
            url: recordUrl(type, r.Id),
            keywords: `${name} ${type} record`,
        };
        if (type === "User") {
            // Users are also found by Username and Alias; rank those matches too.
            item.keywords += ` ${r.Username || ""} ${r.Alias || ""}`;
            item.sub = userSub(r);
            item.actions = userActions(r.Id);
            item.user = r; // raw fields for the "login" verb
        }
        return item;
    }

    function loadRecent() {
        if (!liveEnabled) return;
        ask("recent", {}, (resp) => {
            if (!resp || !liveEnabled) return;
            recentRecords = (resp.records || []).map(mapRecord);
            if (opened && !inputEl.value.trim()) render("");
        });
        // Recent Flow links open the version that was latest when they were
        // saved; move them to the current one.
        const flowIds = SFEN_RECENTS.flowIds(recents);
        if (!flowIds.length) return;
        ask("flowVersions", { flowIds }, (resp) => {
            const list = resp && liveEnabled && SFEN_RECENTS.updateFlows(host, resp.versions);
            if (!list) return;
            recents = list;
            if (opened && !inputEl.value.trim()) render("");
        });
    }

    let searchTimer = null;
    let searchSeq = 0; // bumped per request; a response for an older one is ignored
    // Search records for `term`. A term under 2 characters (or "") just drops
    // the live results and any search still in flight.
    function runLiveSearch(term) {
        const seq = ++searchSeq;
        if (!liveEnabled || term.trim().length < 2) {
            liveRecords = [];
            liveRecordsTerm = "";
            setLoading("search", false);
            return;
        }
        setLoading("search", true);
        // The "login" verb queries users directly; plain search covers all records.
        const action = activeVerb && VERBS[activeVerb].kind === "login" ? "users" : "search";
        ask(action, { term }, (resp) => {
            if (seq !== searchSeq) return;
            setLoading("search", false);
            // A failed search counts as "no matches" (so "login" doesn't wait forever).
            liveRecords = resp ? (resp.records || []).map(mapRecord) : [];
            liveRecordsTerm = term;
            if (opened) render(inputEl.value);
        });
    }

    // ---- Recents persistence --------------------------------------------
    function pushRecent(item) {
        if (!item || !SFEN_RECENTS.isSetup(item.url)) return;
        // Optimistic in-memory update; SFEN_RECENTS.record persists (setup-only).
        recents = recents.filter((r) => r.url !== item.url && !(item.flow && r.flow === item.flow));
        recents.unshift({ label: item.label, hint: item.hint, url: item.url, flow: item.flow });
        recents = recents.slice(0, 10);
        SFEN_RECENTS.record(item, host);
    }

    // ---- Overlay UI ------------------------------------------------------
    let overlayHost, shadow, inputEl, listEl, footerEl, loaderEl, panelEl, orgEl;
    let opened = false;
    let activeIndex = 0;
    let footerCount = "";
    let footerResetTimer = null;

    // The content script keeps running on already-open tabs after the
    // extension is reloaded/updated, but its chrome.* APIs then throw
    // "Extension context invalidated". Bail out cleanly in that case.
    function extAlive() {
        try {
            return !!(chrome.runtime && chrome.runtime.id);
        } catch (e) {
            return false;
        }
    }

    function applyTheme() {
        if (!extAlive() || !shadow) return;
        try {
            chrome.storage.sync.get(["settings"], (res) => {
                if (chrome.runtime.lastError || !res) return;
                const settings = SFEN_SETTINGS.normalize(res.settings);
                const theme = SFEN_SETTINGS.resolveTheme(settings);
                shadow.host.setAttribute("data-theme", theme);
                if (paletteDark !== (theme === "dark")) {
                    paletteDark = theme === "dark";
                    paintOrg();
                }
            });
        } catch (e) {
            /* context invalidated */
        }
    }

    function ensureOverlay() {
        // Rebuild if Lightning's SPA re-render detached our node — otherwise
        // open() would add the .open class to an orphan and "open" invisibly.
        if (overlayHost && document.documentElement.contains(overlayHost)) return;
        SFEN_SETTINGS.injectFonts();
        overlayHost = document.createElement("div");
        overlayHost.id = "sfen-cmdk-host";
        // Closed, and synthetic events are dropped, so page scripts can't
        // read the results or drive the palette (search, "Login as").
        shadow = overlayHost.attachShadow({ mode: "closed" });
        ["click", "mousedown", "keydown", "input"].forEach((type) =>
            shadow.addEventListener(type, (e) => {
                if (!e.isTrusted) e.stopImmediatePropagation();
            }, true)
        );

        // Inject styles inline so they apply synchronously on first paint.
        const style = document.createElement("style");
        style.textContent = PALETTE_CSS;
        shadow.appendChild(style);

        const backdrop = document.createElement("div");
        backdrop.className = "backdrop";
        backdrop.addEventListener("mousedown", (e) => {
            if (e.target === backdrop) close();
        });

        const panel = document.createElement("div");
        panel.className = "panel";
        panel.setAttribute("role", "combobox");
        panel.setAttribute("aria-expanded", "true");
        panelEl = panel;

        const searchWrap = document.createElement("div");
        searchWrap.className = "search-wrap";
        searchWrap.innerHTML = UI_ICONS.search;

        inputEl = document.createElement("input");
        inputEl.className = "search";
        inputEl.type = "text";
        inputEl.placeholder = "Search Salesforce — objects, setup, records, bookmarks…";
        inputEl.setAttribute("spellcheck", "false");
        inputEl.setAttribute("autocomplete", "off");
        inputEl.setAttribute("role", "searchbox");
        inputEl.setAttribute("aria-controls", "sfen-results");
        inputEl.addEventListener("input", onInput);
        inputEl.addEventListener("keydown", onInputKeydown);

        loaderEl = document.createElement("div");
        loaderEl.className = "loader";

        orgEl = document.createElement("span");
        orgEl.className = "org";
        orgEl.innerHTML = '<span class="org-dot org-mark"></span><span class="org-name"></span>';

        searchWrap.appendChild(inputEl);
        searchWrap.appendChild(loaderEl);
        searchWrap.appendChild(orgEl);
        paintOrg();

        listEl = document.createElement("ul");
        listEl.className = "results";
        listEl.id = "sfen-results";
        listEl.setAttribute("role", "listbox");

        footerEl = document.createElement("div");
        footerEl.className = "footer";
        footerEl.innerHTML = footerHtml();

        panel.appendChild(searchWrap);
        panel.appendChild(listEl);
        panel.appendChild(footerEl);
        backdrop.appendChild(panel);
        shadow.appendChild(backdrop);
        document.body.appendChild(overlayHost);

        // Keep focus inside the palette while it's open.
        overlayHost.addEventListener("focusout", () => {
            if (opened) requestAnimationFrame(() => focusInput());
        });
    }

    // Footer key hints for the current mode; the right-aligned .footer-count
    // is filled separately (setFooterCount).
    function footerHtml() {
        if (activeVerb && VERBS[activeVerb].kind === "org") {
            return (
                '<span><kbd>↑↓</kbd> move</span>' +
                '<span><kbd>↵</kbd> open in new tab</span>' +
                '<span><kbd>→</kbd> this page there</span>' +
                '<span><kbd>esc</kbd> close</span>' +
                '<span class="footer-count"></span>'
            );
        }
        if (activeVerb && VERBS[activeVerb].kind === "login") {
            return (
                '<span><kbd>↵</kbd> log in</span>' +
                `<span><kbd>${MOD}↵</kbd> incognito</span>` +
                '<span><kbd>⌫</kbd> back to search</span>' +
                '<span class="footer-count"></span>'
            );
        }
        return (
            '<span><kbd>↑↓</kbd> move</span>' +
            '<span><kbd>↵</kbd> open</span>' +
            `<span><kbd>${MOD}↵</kbd> new tab</span>` +
            '<span><kbd>→</kbd> actions</span>' +
            // In the "fields" verb's object step, Tab completes the object instead.
            (activeVerb === "fields" && !fieldsTarget(inputEl.value)
                ? '<span><kbd>tab</kbd> search fields</span>'
                : '<span><kbd>tab</kbd> lock verb</span>') +
            '<span><kbd>esc</kbd> close</span>' +
            '<span class="footer-count"></span>'
        );
    }

    function resetFooter() {
        if (!footerEl) return;
        footerEl.innerHTML = footerHtml();
        setFooterCount(footerCount);
    }

    // Current org (saved name, else the cleaned-up My Domain) for the search
    // bar, plus the saved orgs and their tab colors for the "org" verb.
    function loadOrg() {
        if (!extAlive()) return;
        chrome.storage.sync.get({ quickOrgs: [], orgColors: {}, settings: null }, (res) => {
            if (chrome.runtime.lastError || !res) return;
            const short = SFEN_ORGS.shortHost(host);
            const all = Array.isArray(res.quickOrgs) ? res.quickOrgs : [];
            savedOrgs = all.filter((o) => o && SFEN_URL.isOrgHost(o.host));
            currentOrg = savedOrgs.find((o) => SFEN_ORGS.shortHost(o.host.toLowerCase()) === short) || null;
            tabColors = SFEN_SETTINGS.normalize(res.settings).orgTabColors;
            // Assigned over the full list, as everywhere else, so colors match.
            orgColorMap = SFEN_ORG_COLORS.assign(all, res.orgColors);
            orgName = currentOrg ? SFEN_ORGS.displayName(currentOrg) : SFEN_ORGS.defaultName(host);
            orgKind = SFEN_ORGS.orgType(currentOrg || { host });
            paintOrg();
            if (opened && activeVerb && VERBS[activeVerb].kind === "org") render(inputEl.value);
        });
    }

    // A saved org's color icon when tab colors are on, else its type dot.
    function orgMarker(org, size) {
        if (tabColors && org && orgColorMap[SFEN_ORG_COLORS.keyOf(org)]) {
            return SFEN_ORG_COLORS.tile(
                orgColorMap[SFEN_ORG_COLORS.keyOf(org)],
                SFEN_ORG_COLORS.initial(org),
                SFEN_ORGS.orgType(org) === "production",
                paletteDark,
                size
            );
        }
        const dot = document.createElement("span");
        dot.className = "org-dot " + SFEN_ORGS.orgType(org || { host });
        return dot;
    }

    // Hidden while inspecting a record (the record header names it instead).
    function paintOrg() {
        if (!orgEl) return;
        const marker = orgMarker(currentOrg, 14);
        marker.classList.add("org-mark");
        orgEl.querySelector(".org-mark").replaceWith(marker);
        orgEl.querySelector(".org-name").textContent = orgName;
        orgEl.hidden = !orgName || !!(activeVerb && VERBS[activeVerb].kind === "inspect");
    }

    // The spinner shows while any request is pending ("search", "inspect",
    // "login"); setLoading(null) clears them all.
    const loadingKeys = new Set();
    function setLoading(key, on) {
        if (!key) loadingKeys.clear();
        else if (on) loadingKeys.add(key);
        else loadingKeys.delete(key);
        if (loaderEl) loaderEl.classList.toggle("on", loadingKeys.size > 0);
    }

    // True when "verb arg" is the start of a Setup page name ("login h" ->
    // Login History, "api usage" -> API Usage Notifications). An empty arg
    // never matches, so "record " still opens the inspector.
    function startsSetupName(verb, arg) {
        if (!arg.trim()) return false;
        const typed = (verb + " " + arg).toLowerCase().replace(/\s+/g, " ").trimEnd();
        return SETUP_PAGES.some(([label]) => label.toLowerCase().startsWith(typed));
    }

    function onInput() {
        if (!opened) return;
        expandedKey = null;
        clearTimeout(searchTimer);
        // Too short to search: drop the live results (and any search in flight) now.
        if (inputEl.value.trim().length < 2) runLiveSearch("");
        // A word verb followed by a space (e.g. "new ") switches to verb mode;
        // the rest becomes the argument. Typing the bare word still searches.
        // Verb words also start Setup names ("Login History", "Record Page
        // Settings"): while "verb arg" is the start of one, go back to (or stay
        // in) plain search. A verb locked with Tab or a hint never goes back.
        if (!activeVerb) {
            const m = inputEl.value.match(/^([a-zA-Z]+)\s+(.*)$/);
            const key = m && m[1].toLowerCase();
            if (m && VERBS[key] && !startsSetupName(key, m[2])) {
                setVerb(key, m[2], m[1]);
                return;
            }
            render(inputEl.value);
        } else if (autoVerbWord && startsSetupName(activeVerb, inputEl.value)) {
            const text = autoVerbWord + " " + inputEl.value;
            inputEl.value = text;
            clearVerb(); // renders the plain search
            inputEl.setSelectionRange(text.length, text.length);
        } else {
            render(inputEl.value);
        }
        // Verb results are local, except "login", which searches users.
        if (activeVerb && VERBS[activeVerb].kind !== "login") return;
        const term = inputEl.value;
        if (term.trim().length >= 2) searchTimer = setTimeout(() => runLiveSearch(term), 140);
    }

    function highlight(label, query) {
        const q = query.trim().toLowerCase();
        const set = q ? new Set(highlightPositions(q, label)) : new Set();
        let html = "";
        for (let i = 0; i < label.length; i++) {
            // One <mark> per run of consecutive matches.
            if (set.has(i) && !set.has(i - 1)) html += "<mark>";
            html += escapeHtml(label[i]);
            if (set.has(i) && !set.has(i + 1)) html += "</mark>";
        }
        return html;
    }

    const flatResults = []; // one entry per visible .result row, in DOM order

    function groupHeader(text) {
        const h = document.createElement("li");
        h.className = "group-header";
        h.textContent = text;
        h.setAttribute("aria-hidden", "true");
        return h;
    }

    // Build a .result <li>. A normal result passes the item; a ⋯ sub-action
    // passes isSub=true with a lighter shape ({label,hint}).
    function makeRow(item, idx, isSub) {
        const li = document.createElement("li");
        li.className = "result" + (isSub ? " subaction" : "");
        li.id = "sfen-opt-" + idx;
        li.dataset.index = idx;
        li.setAttribute("role", "option");

        const icon = document.createElement("span");
        icon.className = "icon";
        if (!isSub && item.org) icon.appendChild(orgMarker(item.org, 16));
        else icon.innerHTML = iconSvg(isSub ? GROUPS.ACTION : item.group);

        const wrap = document.createElement("span");
        wrap.className = "label-wrap";
        const label = document.createElement("span");
        label.className = "label";
        label.innerHTML = isSub
            ? escapeHtml(item.label)
            : highlight(item.label, item.highlightQuery != null ? item.highlightQuery : currentQuery);
        if (!isSub && item.api) {
            const api = document.createElement("span");
            api.className = "api mono";
            api.textContent = item.api;
            label.appendChild(api);
        }
        wrap.appendChild(label);
        if (!isSub && item.sub) {
            const sub = document.createElement("span");
            sub.className = "sub";
            sub.textContent = item.sub;
            wrap.appendChild(sub);
        }

        li.appendChild(icon);
        li.appendChild(wrap);
        // Group headers already name Setup/object/bookmark rows; only records
        // (their object type), actions (e.g. "ID"), apps (console or not) and
        // fields (their data type) carry a trailing hint.
        const hinted = [GROUPS.RECORD, GROUPS.ACTION, GROUPS.APP, GROUPS.FIELD, GROUPS.ORG, GROUPS.APEX];
        if (!isSub && hinted.includes(item.group)) {
            const hint = document.createElement("span");
            hint.className = "hint";
            hint.textContent = item.hint || "";
            li.appendChild(hint);
        }

        if (!isSub && item.actions && item.actions.length) {
            const more = document.createElement("button");
            more.className = "more";
            more.type = "button";
            more.textContent = "⋯";
            more.setAttribute("aria-label", "More actions");
            more.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleExpand(item.url);
            });
            li.appendChild(more);
        }

        const enter = document.createElement("span");
        enter.className = "enter";
        enter.innerHTML = UI_ICONS.enter;
        li.appendChild(enter);

        li.addEventListener("mousemove", () => setActive(idx));
        li.addEventListener("click", (e) => choose(idx, e.metaKey || e.ctrlKey));
        return li;
    }

    // Append result rows to `container`, expanding ⋯ actions inline for the row
    // whose url matches expandedKey. Registers each visible row in flatResults.
    function renderRows(container, items) {
        items.forEach((item) => {
            const i = flatResults.length;
            flatResults.push(item);
            container.appendChild(makeRow(item, i, false));
            if (expandedKey && item.url === expandedKey && item.actions) {
                item.actions.forEach((action) => {
                    const si = flatResults.length;
                    flatResults.push({ __action: action });
                    container.appendChild(makeRow(action, si, true));
                });
            }
        });
    }

    function render(query) {
        currentQuery = query;
        listEl.innerHTML = "";
        flatResults.length = 0;
        setFooterCount("");
        paintOrg();
        if (activeVerb) renderVerb(query);
        else if (query.trim()) renderList(query);
        else renderBoard();
    }

    // ---- Command verbs ---------------------------------------------------
    function objectSource() {
        return liveObjects && liveObjects.length
            ? liveObjects
            : FALLBACK_OBJECTS.map((n) => ({ api: n, label: n }));
    }

    // typedWord: the verb as typed when "word " switched it on (it can then
    // switch back to plain search); omit it to lock the verb (Tab, hint click).
    function setVerb(key, arg, typedWord) {
        if (!VERBS[key]) return;
        activeVerb = key;
        autoVerbWord = typedWord || null;
        inputEl.value = arg || "";
        const kind = VERBS[key].kind;
        inputEl.placeholder =
            kind === "inspect"
                ? "Filter fields…"
                : kind === "login"
                ? "Type a user's name…"
                : kind === "app"
                ? "Type an app name…"
                : kind === "org"
                ? "Type an org name…"
                : "Type an object name…";
        renderChip();
        resetFooter();
        if (kind === "inspect") fetchInspect();
        if (kind === "login") runLiveSearch(inputEl.value);
        render(inputEl.value);
        focusInput();
    }

    function clearVerb() {
        activeVerb = null;
        autoVerbWord = null;
        inspectKey = null;
        inspectRecord = null;
        setLoading("inspect", false);
        fieldsKey = null;
        setLoading("fields", false);
        inputEl.placeholder = DEFAULT_PLACEHOLDER;
        renderChip();
        resetFooter();
        render(inputEl.value);
    }

    function renderChip() {
        const wrap = inputEl.parentElement; // .search-wrap
        let chip = wrap.querySelector(".scope-chip");
        if (!activeVerb) {
            if (chip) chip.remove();
            return;
        }
        if (!chip) {
            // Clicking the chip clears the verb (with Esc / Backspace as backups).
            chip = document.createElement("button");
            chip.type = "button";
            chip.className = "scope-chip";
            chip.title = "Remove (Esc)";
            chip.addEventListener("click", (e) => {
                e.preventDefault();
                clearVerb();
                focusInput();
            });
            wrap.insertBefore(chip, inputEl);
        }
        chip.innerHTML = '<span class="chip-label"></span><span class="chip-x">' + UI_ICONS.close + "</span>";
        // For the "record" verb show the live record's object name (e.g. Account);
        // object verbs keep their static label (New / List / Fields).
        const v = VERBS[activeVerb];
        let label = v.label;
        if (v.kind === "inspect") {
            const ctx = currentRecordContext();
            label = ctx ? "This " + ctx.type : "Record";
        }
        chip.querySelector(".chip-label").textContent = label;
    }

    function renderVerb(query) {
        if (VERBS[activeVerb].kind === "inspect") {
            renderInspector();
            return;
        }
        if (VERBS[activeVerb].kind === "login") {
            renderLogin(query);
            return;
        }
        if (VERBS[activeVerb].kind === "app") {
            renderApps(query);
            return;
        }
        if (VERBS[activeVerb].kind === "org") {
            renderOrgs(query);
            return;
        }
        if (activeVerb === "fields") {
            resetFooter(); // the Tab hint differs between the object and field steps
            const target = fieldsTarget(query);
            if (target) {
                renderFields(target.obj, target.text);
                return;
            }
        }
        panelEl.classList.remove("board-mode");
        const items = objectVerbEntries(VERBS[activeVerb].action, objectSource(), query).slice(0, 24);
        if (!items.length) return showEmpty("No objects");
        listEl.appendChild(groupHeader("Objects"));
        renderRows(listEl, items);
        setActive(0);
    }

    // "app" verb: the user's apps matching the query, in App Launcher order
    // when it's empty.
    function renderApps(query) {
        panelEl.classList.remove("board-mode");
        if (!liveEnabled) return showEmpty("Live org access is off (enable it in Settings).");
        if (!appItems) return showEmpty(appsRequested ? "Loading apps…" : "Couldn't load apps");
        const q = query.trim();
        const items = q
            ? appItems
                  .map((item) => ({ item, sc: SFEN_URL.matchScore(q, item.label, item.keywords) }))
                  .filter((s) => s.sc >= 0)
                  .sort((a, b) => b.sc - a.sc)
                  .map((s) => s.item)
            : appItems;
        if (!items.length) return showEmpty(q ? `No apps match “${q}”` : "No apps");
        listEl.appendChild(groupHeader(GROUPS.APP));
        renderRows(listEl, items);
        setActive(0);
    }

    // "org" verb: saved orgs, pinned first. Enter opens the org in a new tab;
    // → offers the page you're on in that org, to compare the two.
    function renderOrgs(query) {
        panelEl.classList.remove("board-mode");
        if (!savedOrgs.length) {
            return showEmpty(
                "No saved orgs yet",
                "Save the orgs you use in the Orgs tab of the Navigator popup, then switch between them here."
            );
        }
        const q = query.trim();
        const ordered = savedOrgs.filter((o) => o.pinned).concat(savedOrgs.filter((o) => !o.pinned));
        const scored = ordered
            .map((o) => {
                const type = SFEN_ORGS.TYPES[SFEN_ORGS.orgType(o)];
                return { o, sc: q ? SFEN_URL.matchScore(q, SFEN_ORGS.displayName(o), `${o.host} ${type}`) : 0 };
            })
            // Letters scattered across the host ("uat" in "momentum-dx.scratch…")
            // aren't a match: keep name matches and words of the host or type.
            .filter((r) => (q ? r.sc >= 100 : true));
        if (q) scored.sort((a, b) => b.sc - a.sc);
        if (!scored.length) return showEmpty(`No orgs match “${q}”`);
        listEl.appendChild(groupHeader(GROUPS.ORG));
        renderRows(listEl, scored.map((r) => orgItem(r.o)));
        setActive(0);
    }

    function orgItem(org) {
        const name = SFEN_ORGS.displayName(org);
        const here = org === currentOrg;
        const samePage = here ? null : SFEN_ORGS.samePageUrl(org, location.href);
        return {
            label: name,
            sub: `${SFEN_ORGS.TYPES[SFEN_ORGS.orgType(org)]} · ${SFEN_ORGS.shortHost(org.host)}`,
            hint: here ? "This tab" : "",
            group: GROUPS.ORG,
            url: "https://" + org.host + "/",
            newTab: true,
            org,
            actions: samePage
                ? [{ label: `This page in ${name}`, hint: "Same page", kind: "nav", url: samePage, newTab: true }]
                : null,
        };
    }

    // "fields" verb, second step: "<object> <field text>" searches that object's
    // fields. The object is the longest run of leading words that exactly names
    // one (API name first, then label or plural label), else the best match for
    // the first word.
    // While the text is still the start of a multi-word object label ("invoice
    // l" -> Invoice Line) it stays in the object step. Returns { obj, text } or
    // null for the object step.
    function fieldsTarget(arg) {
        const text = arg.replace(/^\s+/, "");
        if (!/\S\s/.test(text)) return null;
        const lower = text.toLowerCase();
        const objects = objectSource();
        const labelOf = (o) => (o.label || o.api).toLowerCase();
        if (!/\s$/.test(text) && objects.some((o) => labelOf(o).startsWith(lower))) return null;
        const cuts = []; // word ends, longest head first
        for (let i = text.length - 1; i > 0; i--) {
            if (/\s/.test(text[i]) && /\S/.test(text[i - 1])) cuts.push(i);
        }
        for (const i of cuts) {
            const head = lower.slice(0, i);
            const obj =
                objects.find((o) => o.api.toLowerCase() === head) ||
                objects.find((o) => labelOf(o) === head || (o.plural || "").toLowerCase() === head);
            if (obj) return { obj, text: text.slice(i).trim() };
        }
        const first = cuts[cuts.length - 1];
        let best = null;
        let bestScore = -1;
        objects.forEach((o) => {
            const sc = objectScore(lower.slice(0, first), o);
            if (sc > bestScore) {
                best = o;
                bestScore = sc;
            }
        });
        return best ? { obj: best, text: text.slice(first).trim() } : null;
    }

    function renderFields(obj, text) {
        panelEl.classList.remove("board-mode");
        if (!liveEnabled) return showEmpty("Live org access is off (enable it in Settings).");
        const name = obj.label || obj.api;
        const fields = fieldsCache[obj.api];
        if (!fields) {
            if (fieldsFailed[obj.api]) return showEmpty(`Couldn't load fields for ${name}`);
            loadFields(obj.api);
            return showEmpty("Loading fields…");
        }
        const q = text.trim();
        const scored = [];
        fields.forEach((f) => {
            const sc = q ? SFEN_URL.matchScore(q, f.label, f.api) : 0;
            // Package fields (SBQQ__Discount__c) after the org's own.
            if (sc >= 0) scored.push({ f, sc: sc - (SFEN_URL.namespaceOf(f.api) ? PACKAGE_PENALTY : 0) });
        });
        scored.sort((a, b) => b.sc - a.sc || String(a.f.label).localeCompare(String(b.f.label)));
        setFooterCount(`${scored.length} of ${fields.length} fields`);
        if (!scored.length) return showEmpty(`No ${name} fields match “${q}”`);
        listEl.appendChild(groupHeader(`${name} fields`));
        renderRows(
            listEl,
            scored.slice(0, 50).map(({ f }) => ({
                label: f.label || f.api,
                api: f.api,
                hint: f.type,
                group: GROUPS.FIELD,
                url: `/lightning/setup/ObjectManager/${obj.api}/FieldsAndRelationships/${f.key}/view`,
                highlightQuery: q,
            }))
        );
        setActive(0);
    }

    // "login" verb: users from the "users" lookup. Enter logs in as the user in a
    // new tab (like the ⋯ "Login as — new tab" action); Ctrl/⌘+Enter uses Incognito.
    function renderLogin(query) {
        panelEl.classList.remove("board-mode");
        if (!liveEnabled) return showEmpty("Live org access is off (enable it in Settings).");
        if (query.trim().length < 2) return showEmpty("Type a name to find a user");
        const users = liveRecords.filter((i) => i.user);
        if (!users.length) {
            return showEmpty(liveRecordsTerm === query ? `No users match “${query.trim()}”` : "Searching users…");
        }
        listEl.appendChild(groupHeader("Users"));
        users.forEach((item) => listEl.appendChild(makeLoginRow(item)));
        setActive(0);
    }

    // Inactive users render dimmed and aren't selectable (not in flatResults).
    function makeLoginRow(item) {
        const u = item.user;
        const inactive = u.IsActive === false;
        const li = document.createElement("li");
        li.className = "result login-row" + (inactive ? " disabled" : "");
        li.setAttribute("role", "option");
        li.innerHTML =
            '<span class="icon">' + iconSvg(GROUPS.PROFILE) + "</span>" +
            '<span class="label-wrap"><span class="label"></span><span class="sub"></span></span>';
        li.querySelector(".label").innerHTML = highlight(item.label, currentQuery);
        li.querySelector(".sub").textContent = [u.ProfileName, inactive ? "Inactive" : u.Username]
            .filter(Boolean)
            .join(" · ");
        if (inactive) {
            li.setAttribute("aria-disabled", "true");
            const hint = document.createElement("span");
            hint.className = "hint";
            hint.textContent = "Inactive users can't be logged in as";
            li.appendChild(hint);
            return li;
        }
        const idx = flatResults.length;
        flatResults.push({ label: item.label, loginUserId: u.Id });
        li.id = "sfen-opt-" + idx;
        li.dataset.index = idx;
        [["Log in", false], ["Incognito", true]].forEach(([text, incognito]) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "login-btn" + (incognito ? " secondary" : "");
            btn.textContent = text;
            if (incognito)
                btn.title = "Opens a private window. Your session is passed in the link, so it stays in that window's history until you close it.";
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                runAction({ kind: "loginAs", userId: u.Id, incognito });
            });
            li.appendChild(btn);
        });
        li.addEventListener("mousemove", () => setActive(idx));
        li.addEventListener("click", (e) => choose(idx, e.metaKey || e.ctrlKey));
        return li;
    }

    // Parse the current record's type + Id from a /lightning/r/{Type}/{Id}/...
    // URL, for the record inspector.
    function currentRecordContext() {
        const m = location.pathname.match(/\/lightning\/r\/([^/]+)\/([^/]+)\//);
        return m ? { type: m[1], id: m[2] } : null;
    }

    function fetchInspect() {
        const ctx = currentRecordContext();
        if (!ctx || !liveEnabled) return;
        // Field labels (cached per org + object); on failure rows keep API names only.
        const dKey = host + "/" + ctx.type;
        if (!describeCache[dKey]) {
            ask("describe", { recordType: ctx.type }, (resp) => {
                if (!resp) return;
                const labels = {};
                (resp.fields || []).forEach((f) => (labels[f.name] = f.label));
                describeCache[dKey] = labels;
                if (opened && activeVerb && VERBS[activeVerb].kind === "inspect")
                    render(inputEl.value);
            });
        }
        const key = ctx.type + "/" + ctx.id;
        if (inspectKey === key && inspectRecord) return; // already loaded
        inspectKey = key;
        inspectRecord = null;
        setLoading("inspect", true);
        ask("record", { recordType: ctx.type, recordId: ctx.id }, (resp) => {
            if (inspectKey !== key) return; // stale: the verb was cleared or reopened
            setLoading("inspect", false);
            inspectRecord = resp ? resp.record : null;
            if (opened && activeVerb && VERBS[activeVerb].kind === "inspect")
                render(inputEl.value);
        });
    }

    function renderInspector() {
        panelEl.classList.remove("board-mode");
        const ctx = currentRecordContext();
        if (!ctx) return showEmpty("Open a record first, then run “record” to inspect it.");
        if (!liveEnabled) return showEmpty("Live org access is off (enable it in Settings).");
        if (!inspectRecord) return showEmpty("Loading record…");

        const wrap = document.createElement("div");
        wrap.className = "inspector";
        const head = document.createElement("div");
        head.className = "insp-head";
        head.innerHTML =
            '<span class="insp-title-wrap"><span class="insp-title"></span>' +
            '<span class="insp-type"><span class="insp-type-name"></span> · <span class="mono"></span></span></span>' +
            '<button class="insp-action" type="button">Copy Id</button>' +
            '<button class="insp-action" type="button">Copy JSON</button>';
        head.querySelector(".insp-title").textContent =
            inspectRecord.Name || inspectRecord.CaseNumber || ctx.id;
        head.querySelector(".insp-type-name").textContent = ctx.type;
        head.querySelector(".insp-type .mono").textContent = ctx.id;
        const [copyIdBtn, copyJsonBtn] = head.querySelectorAll(".insp-action");
        copyIdBtn.addEventListener("click", () =>
            copyWithFeedback(copyIdBtn, inspectRecord.Id || ctx.id)
        );
        copyJsonBtn.addEventListener("click", () => {
            const data = { ...inspectRecord };
            delete data.attributes;
            copyWithFeedback(copyJsonBtn, JSON.stringify(data, null, 2));
        });
        wrap.appendChild(head);

        const labels = describeCache[host + "/" + ctx.type] || {};
        const filter = (inputEl.value || "").trim().toLowerCase();
        const keys = Object.keys(inspectRecord).filter((k) => k !== "attributes");
        const shown = keys.filter(
            (k) =>
                !filter ||
                k.toLowerCase().includes(filter) ||
                (labels[k] || "").toLowerCase().includes(filter)
        );
        inputEl.placeholder = `Filter ${keys.length} fields`;
        setFooterCount(`${shown.length} of ${keys.length} fields`);
        shown.forEach((k) => {
            const v = inspectRecord[k];
            const val =
                v === null || v === undefined
                    ? "—"
                    : typeof v === "object"
                    ? JSON.stringify(v)
                    : String(v);
            const row = document.createElement("div");
            row.className = "insp-row";
            row.innerHTML =
                '<span class="insp-key mono"></span><span class="insp-val"></span>' +
                '<button class="insp-copy" type="button">Copy</button>';
            const keyEl = row.querySelector(".insp-key");
            if (labels[k]) {
                // Label above, API name below in mono.
                keyEl.classList.add("labeled");
                keyEl.innerHTML = '<span class="insp-label"></span><span class="insp-api mono"></span>';
                keyEl.querySelector(".insp-label").textContent = labels[k];
                keyEl.querySelector(".insp-api").textContent = k;
            } else {
                keyEl.textContent = k;
            }
            const valEl = row.querySelector(".insp-val");
            const empty = v === null || v === undefined;
            valEl.textContent = empty ? "Empty" : val;
            valEl.classList.toggle("dim", empty);
            const copyBtn = row.querySelector(".insp-copy");
            copyBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                copyWithFeedback(copyBtn, val);
            });
            wrap.appendChild(row);
        });
        listEl.appendChild(wrap);
    }

    // navigator.clipboard.writeText as a promise that also rejects when the
    // clipboard API is missing or throws.
    function writeClipboard(text) {
        try {
            return navigator.clipboard.writeText(text);
        } catch (err) {
            return Promise.reject(err);
        }
    }

    // Copy `text`, briefly swapping the button's label for a green "Copied"
    // (or a red "Copy failed").
    function copyWithFeedback(btn, text) {
        if (btn.classList.contains("copied") || btn.classList.contains("failed")) return;
        const label = btn.textContent;
        const show = (msg, cls) => {
            btn.textContent = msg;
            btn.classList.add(cls);
            setTimeout(() => {
                btn.textContent = label;
                btn.classList.remove(cls);
            }, 1500);
        };
        writeClipboard(text).then(
            () => show("Copied", "copied"),
            () => show("Copy failed", "failed")
        );
    }

    function renderList(query) {
        panelEl.classList.remove("board-mode");
        const results = compute(query);
        if (results.length === 0) {
            const verbs =
                'Try fewer words, or start with <span class="mono">new</span>, ' +
                '<span class="mono">list</span> or <span class="mono">fields</span>.';
            return showEmpty(
                `No matches for “${query.trim()}”`,
                (liveEnabled
                    ? "Search looks through Setup, objects, records, apps, flows, profiles, permission sets, Apex, custom metadata types and your bookmarks. "
                    : "Live org access is off, so only Setup, objects, Setup tabs and your bookmarks are searched. ") + verbs
            );
        }
        setFooterCount(results.length === 1 ? "1 result" : `${results.length} results`);
        // Order groups by best match (results are score-sorted, so a group's
        // first appearance marks its top score — a strong Setup match can thus
        // surface above the Objects group).
        const byGroup = {};
        const order = [];
        results.forEach((r) => {
            (byGroup[r.group] = byGroup[r.group] || []).push(r);
            if (!order.includes(r.group)) order.push(r.group);
        });
        order.forEach((g) => {
            const items = byGroup[g];
            if (!items.length) return;
            listEl.appendChild(groupHeader(g));
            renderRows(listEl, items);
        });
        setActive(0);
    }

    // A hint line teaching the command verbs; each verb is clickable.
    function buildCmdBar() {
        const bar = document.createElement("div");
        bar.className = "cmd-bar";
        bar.append("Start with ");
        [["new", ", "], ["list", ", "], ["fields", ", "], ["app", ", "], ["org", ", "], ["login", " or "], ["record", " — or paste a record Id."]].forEach(
            ([verb, after]) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "cmd-verb";
                btn.textContent = verb;
                btn.addEventListener("click", () => setVerb(verb, ""));
                bar.append(btn, after);
            }
        );
        return bar;
    }

    // No-search overview: two columns — left Recent+Records, right Bookmarks+Setup Tabs.
    function renderBoard() {
        panelEl.classList.add("board-mode");
        listEl.appendChild(buildCmdBar());
        const recent = recents.slice(0, 7).map((r) => ({ ...r, group: GROUPS.RECENT }));
        const records = recentRecords.slice(0, 20);
        const bookmarks = staticCatalog.filter((i) => i.group === GROUPS.BOOKMARK).slice(0, 8);
        const setupTabs = staticCatalog.filter((i) => i.group === GROUPS.SETUP_TAB).slice(0, 8);

        const board = document.createElement("div");
        board.className = "board";
        const left = document.createElement("div");
        left.className = "column";
        const right = document.createElement("div");
        right.className = "column";

        // Fill left fully, then right, so ↑/↓ flat order reads column by column.
        boardSection(left, "Recent Setup", recent);
        boardSection(left, "Recently viewed", records);
        boardSection(right, GROUPS.BOOKMARK, bookmarks);
        boardSection(right, "Setup quick tabs", setupTabs);

        board.appendChild(left);
        board.appendChild(right);
        listEl.appendChild(board);
        if (flatResults.length) setActive(0);
    }

    function boardSection(col, name, items) {
        if (!items.length) return;
        col.appendChild(groupHeader(name));
        renderRows(col, items);
    }

    function toggleExpand(key) {
        expandedKey = expandedKey === key ? null : key;
        render(currentQuery);
        const pIdx = flatResults.findIndex((e) => !e.__action && e.url === key);
        if (pIdx < 0) return;
        setActive(expandedKey ? pIdx + 1 : pIdx);
    }

    function flashFooter(msg) {
        if (!footerEl) return;
        footerEl.textContent = msg;
        clearTimeout(footerResetTimer);
        footerResetTimer = setTimeout(resetFooter, 1800);
    }

    // Right-aligned footer text, e.g. "7 results" or "8 of 42 fields".
    function setFooterCount(text) {
        footerCount = text;
        const el = footerEl && footerEl.querySelector(".footer-count");
        if (el) el.textContent = text;
    }

    // Centered empty state: a title and an optional HTML body.
    function showEmpty(title, bodyHtml) {
        const e = document.createElement("li");
        e.className = "empty";
        e.innerHTML =
            UI_ICONS.searchLarge +
            '<span class="empty-title"></span>' +
            (bodyHtml ? `<span class="empty-body">${bodyHtml}</span>` : "");
        e.querySelector(".empty-title").textContent = title;
        listEl.appendChild(e);
    }

    function optionEls() {
        return listEl.querySelectorAll(".result:not(.disabled)");
    }

    function setActive(i) {
        const els = optionEls();
        if (!els.length) return;
        i = Math.max(0, Math.min(i, els.length - 1));
        els.forEach((el) => el.classList.remove("active"));
        activeIndex = i;
        const el = els[i];
        el.classList.add("active");
        el.scrollIntoView({ block: "nearest" });
        inputEl.setAttribute("aria-activedescendant", el.id);
        const entry = flatResults[i];
        if (entry && entry.loginUserId)
            setFooterCount(`You'll land on this same page as ${entry.label.split(" ")[0]}`);
    }

    function runAction(action, newTab) {
        if (!opened) return;
        if (action.kind === "nav") {
            close();
            navigate(action.url, newTab || !!action.newTab);
        } else if (action.kind === "copy") {
            writeClipboard(action.text).then(
                () => flashFooter("Copied " + action.text),
                () => flashFooter("Copy failed")
            );
        } else if (action.kind === "loginAs") {
            setLoading("login", true);
            ask(
                "loginAs",
                {
                    userId: action.userId,
                    incognito: !!action.incognito,
                    // Land on the page we're currently viewing, as that user.
                    targetPath: location.pathname + location.search,
                },
                (resp) => {
                    setLoading("login", false);
                    if (resp && resp.ok) close();
                    else flashFooter((resp && resp.error) || "Login as failed");
                }
            );
        }
    }

    function choose(i, newTab) {
        if (!opened) return;
        const entry = flatResults[i];
        if (!entry) return;
        if (entry.__action) {
            runAction(entry.__action, newTab);
            return;
        }
        if (entry.loginUserId) {
            runAction({ kind: "loginAs", userId: entry.loginUserId, incognito: !!newTab });
            return;
        }
        pushRecent(entry);
        close();
        navigate(entry.url, newTab || !!entry.newTab);
    }

    function onInputKeydown(e) {
        if (e.key === "Tab" && !activeVerb) {
            // Lock a verb typed without a trailing space (e.g. "new" + Tab).
            const first = inputEl.value.trim().toLowerCase().split(/\s+/)[0];
            if (VERBS[first]) {
                e.preventDefault();
                setVerb(first, inputEl.value.trim().slice(first.length).trim());
            }
        } else if (e.key === "Tab" && activeVerb === "fields") {
            // On an object row, complete "<object> " to search its fields. The
            // label is used when it names the object back, else the API name.
            const entry = flatResults[activeIndex];
            if (entry && entry.objectApi) {
                e.preventDefault();
                const byLabel = fieldsTarget(entry.label + " ");
                inputEl.value =
                    (byLabel && byLabel.obj.api === entry.objectApi ? entry.label : entry.objectApi) + " ";
                onInput();
            }
        } else if (e.key === "Backspace" && activeVerb && inputEl.value === "") {
            // Backspace on an empty argument removes the verb chip.
            e.preventDefault();
            clearVerb();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive(activeIndex + 1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive(activeIndex - 1);
        } else if (e.key === "ArrowRight") {
            const entry = flatResults[activeIndex];
            if (entry && !entry.__action && entry.actions && entry.actions.length) {
                e.preventDefault();
                if (expandedKey !== entry.url) toggleExpand(entry.url);
            }
        } else if (e.key === "ArrowLeft") {
            if (expandedKey) {
                e.preventDefault();
                toggleExpand(expandedKey);
            }
        } else if (e.key === "Enter") {
            e.preventDefault();
            choose(activeIndex, e.metaKey || e.ctrlKey);
        }
        e.stopPropagation();
    }

    // select: also select the text (only on open, so refocusing never
    // selects what the user is typing).
    function focusInput(select) {
        if (inputEl) {
            inputEl.focus();
            if (select) inputEl.select();
        }
    }

    function open() {
        if (!paletteEnabled) return;
        ensureOverlay();
        opened = true;
        overlayHost.classList.add("open");
        applyTheme();
        inputEl.value = "";
        inputEl.placeholder = DEFAULT_PLACEHOLDER;
        clearTimeout(searchTimer);
        runLiveSearch(""); // drop live results and any search in flight
        expandedKey = null;
        activeVerb = null;
        autoVerbWord = null;
        inspectKey = null;
        inspectRecord = null;
        renderChip();
        resetFooter();
        render("");
        loadObjects();
        loadRecent();
        loadAdmin();
        loadApps();
        fieldsFailed = {}; // retry objects whose fields failed to load
        // Robust focus: wait for paint, then re-assert on the next tick so we
        // win even if Lightning grabs focus back during the open animation.
        requestAnimationFrame(() =>
            requestAnimationFrame(() => {
                focusInput(true);
                setTimeout(() => focusInput(true), 60);
            })
        );
    }

    function close() {
        if (!opened) return;
        opened = false;
        overlayHost.classList.remove("open");
        clearTimeout(searchTimer);
        runLiveSearch("");
        inspectKey = null; // a late record response is then ignored
        fieldsKey = null; // likewise a late fields response
        setLoading(null);
        // Don't leave the last results (record values, users) in the page.
        listEl.textContent = "";
        flatResults.length = 0;
    }

    function toggle() {
        opened ? close() : open();
    }

    // ---- Init ------------------------------------------------------------
    buildStaticCatalog();
    loadOrg();
    try {
        SFEN_RECENTS.load(host, (list) => {
            recents = list;
        });
        chrome.storage.sync.get(["settings"], (res) => {
            if (chrome.runtime.lastError || !res) return;
            if (res.settings && typeof res.settings.liveOrgAccess === "boolean") {
                liveEnabled = res.settings.liveOrgAccess;
            }
            if (res.settings && typeof res.settings.commandPalette === "boolean") {
                paletteEnabled = res.settings.commandPalette;
            }
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (!extAlive()) return;
            if (area === "sync") {
                if (changes.sfTabs || changes.bookmarks)
                    buildStaticCatalog(() => opened && render(inputEl.value));
                if (changes.quickOrgs || changes.orgColors || changes.settings) loadOrg();
                if (changes.settings) {
                    const s = changes.settings.newValue || {};
                    if (typeof s.liveOrgAccess === "boolean") liveEnabled = s.liveOrgAccess;
                    if (!liveEnabled) {
                        // Drop everything fetched from the org right away; turning
                        // it back on fetches again.
                        liveObjects = null;
                        adminItems = [];
                        appItems = null;
                        fieldsCache = {};
                        fieldsKey = null;
                        setLoading("fields", false);
                        recentRecords = [];
                        catalogCache = null;
                        objectsRequested = false;
                        adminRequested = false;
                        appsRequested = false;
                        runLiveSearch("");
                        if (opened) render(inputEl.value);
                    }
                    if (typeof s.commandPalette === "boolean") paletteEnabled = s.commandPalette;
                    if (!paletteEnabled) close();
                    if (opened) applyTheme();
                }
            }
            if (area === "local" && changes.paletteRecents) {
                recents = SFEN_RECENTS.forOrg(changes.paletteRecents.newValue, host);
            }
        });
    } catch (e) {
        /* context invalidated */
    }

    // ---- Open via the Alt+K Chrome command ------------------------------
    // Alt+K is a browser command (see manifest), captured before the page and
    // relayed here by the background worker — so it works regardless of which
    // frame/element has focus, unlike a page keydown listener.
    try {
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg && msg.type === "sfen-toggle-palette") toggle();
        });
    } catch (e) {
        /* context invalidated */
    }

    // Escape isn't a command, so it stays an in-page handler: collapse an open
    // ⋯ menu first, then a verb chip; only then close the palette.
    document.addEventListener(
        "keydown",
        (e) => {
            if (e.key === "Escape" && opened) {
                e.preventDefault();
                e.stopPropagation();
                if (expandedKey) toggleExpand(expandedKey);
                else if (activeVerb) clearVerb();
                else close();
            }
        },
        true
    );
})();
