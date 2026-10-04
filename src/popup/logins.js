// Orgs tab (formerly Quick Login): zero-setup org launcher.
// Save your orgs once; one click reuses a live Salesforce session (lands you
// straight in) or opens that org's own login page (your browser autofills the
// password, you just complete MFA). No app, key, or password — only org names
// and hosts are stored (chrome.storage.sync "quickOrgs"). Works on and off
// Salesforce. Org names and types come from src/shared/orgs.js.
(function () {
    "use strict";

    const $ = (id) => document.getElementById(id);
    const { icon, toast, confirmInline } = SFEN_UI;
    // chrome.storage.sync allows 8 KB per key; an org entry is ~136 bytes.
    const MAX_ORGS = 50;

    let savedOrgs = []; // [{ id, label, host, isSandbox, pinned }]
    let detected = []; // currently logged-in orgs (from the browser's sid cookies)
    let offSalesforce = false;
    let currentShort = ""; // short host of the active tab's org
    let currentUrl = ""; // the active Salesforce tab's URL, for "Open this page here"
    let query = "";
    let colorsOn = false; // settings.orgTabColors
    let storedColors = {}; // chrome.storage.sync "orgColors"

    function loadSaved() {
        return new Promise((resolve) => {
            chrome.storage.sync.get({ quickOrgs: [] }, (r) => resolve((r && r.quickOrgs) || []));
        });
    }

    function persist(list) {
        savedOrgs = list;
        chrome.storage.sync.set({ quickOrgs: savedOrgs }, () => {
            if (!chrome.runtime.lastError) return;
            // Show what's actually stored, not the list that failed to save.
            toast("Couldn't save: " + chrome.runtime.lastError.message);
            loadSaved().then((stored) => {
                savedOrgs = stored;
                render();
            });
        });
        render();
    }

    // Ask the background worker for every org with a live "sid" cookie. Reuses
    // the existing "orgs" action (works regardless of the current page).
    function detectOrgs() {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage(
                    { type: "palette", action: "orgs", host: "" },
                    (resp) => {
                        if (chrome.runtime.lastError || !resp || !resp.ok) resolve([]);
                        else resolve(resp.orgs || []);
                    }
                );
            } catch (e) {
                resolve([]);
            }
        });
    }

    // An org's color tile when tab colors are on, else its type dot.
    function marker(org, size) {
        const saved = org && savedOrgs.includes(org);
        if (colorsOn && saved) {
            const color = SFEN_ORG_COLORS.assign(savedOrgs, storedColors)[SFEN_ORG_COLORS.keyOf(org)];
            const dark = document.documentElement.classList.contains("nv-dark");
            return SFEN_ORG_COLORS.tile(color, SFEN_ORG_COLORS.initial(org), SFEN_ORGS.orgType(org) === "production", dark, size || 18);
        }
        const dot = document.createElement("span");
        dot.className = "nv-dot " + SFEN_ORGS.orgType(org);
        return dot;
    }

    // Save a new org's color, so removing another org later never changes it.
    // Its own write after the org is saved: a color can't make the save fail.
    function rememberColor(org) {
        if (!colorsOn) return;
        chrome.storage.sync.get({ orgColors: {} }, (r) => {
            const stored = (r && r.orgColors) || {};
            const keys = new Set(savedOrgs.map(SFEN_ORG_COLORS.keyOf));
            const next = {};
            Object.keys(stored).forEach((k) => {
                if (keys.has(k) && SFEN_ORG_COLORS.isColor(stored[k])) next[k] = stored[k];
            });
            const key = SFEN_ORG_COLORS.keyOf(org);
            next[key] = SFEN_ORG_COLORS.assign(savedOrgs, next)[key];
            chrome.storage.sync.set({ orgColors: next }, () => void chrome.runtime.lastError);
        });
    }

    function cleanHost(input) {
        return (input || "")
            .trim()
            .replace(/^https?:\/\//, "")
            .replace(/\/.*$/, "");
    }

    const isSaved = (host) =>
        savedOrgs.some((o) => SFEN_ORGS.shortHost(o.host) === SFEN_ORGS.shortHost(host));

    // One click: open the org host. With a live session it lands straight in;
    // without one, Salesforce shows that org's login page.
    function openOrg(host, background) {
        if (!SFEN_URL.isOrgHost(host)) return toast("That isn't a Salesforce address");
        chrome.tabs.create({ url: "https://" + host, active: !background });
        if (!background) window.SFEN_POPUP_READY.then((r) => r.settings.autoClose && window.close());
    }

    function saveOrg(host, isSandbox) {
        host = cleanHost(host);
        if (!SFEN_URL.isOrgHost(host)) {
            toast("Enter a Salesforce address, like acme.my.salesforce.com");
            return false;
        }
        if (isSaved(host)) {
            toast("That org is already saved");
            return false;
        }
        if (savedOrgs.length >= MAX_ORGS) {
            toast(`You can save up to ${MAX_ORGS} orgs`);
            return false;
        }
        const org = {
            id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
            label: "", // empty = the cleaned-up My Domain name
            host,
            isSandbox: !!isSandbox,
            pinned: false,
        };
        persist([...savedOrgs, org]);
        rememberColor(org);
        toast("Org added");
        return true;
    }

    function update(org, changes) {
        persist(savedOrgs.map((o) => (o.id === org.id ? { ...o, ...changes } : o)));
    }

    function removeOrg(row, org) {
        const before = savedOrgs;
        const remove = () => {
            persist(savedOrgs.filter((o) => o.id !== org.id));
            toast("Org removed", () => persist(before));
        };
        SFEN_SETTINGS.load((settings) => {
            if (settings.confirmDelete) confirmInline(row, SFEN_ORGS.displayName(org), "x", remove);
            else remove();
        });
    }

    function startRename(row, org) {
        const before = savedOrgs;
        row.className = "nv-row is-org is-editing";
        row.innerHTML = '<span class="nv-row-text"><input type="text" class="nv-row-input" aria-label="Org name"></span>';
        row.prepend(marker(org));
        const input = row.querySelector("input");
        input.value = SFEN_ORGS.displayName(org);
        input.placeholder = SFEN_ORGS.defaultName(org.host);
        input.focus();
        input.select();
        let done = false;
        const finish = (save) => {
            if (done) return;
            done = true;
            const label = input.value.trim();
            if (!save || label === SFEN_ORGS.displayName(org)) return render();
            update(org, { label });
            toast("Org renamed", () => persist(before));
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

    // Name + "Type · host" block shared by saved and detected org rows.
    function orgText(host, name, type) {
        const text = document.createElement("span");
        text.className = "nv-row-text";
        text.innerHTML = '<span class="nv-row-label"></span><span class="nv-row-sub"><span></span> · <span class="nv-mono"></span></span>';
        text.querySelector(".nv-row-label").textContent = name;
        text.querySelector(".nv-row-sub span").textContent = SFEN_ORGS.TYPES[type];
        text.querySelector(".nv-mono").textContent = SFEN_ORGS.shortHost(host);
        return text;
    }

    function buildRow(org) {
        const type = SFEN_ORGS.orgType(org);
        const name = SFEN_ORGS.displayName(org);
        const row = document.createElement("div");
        row.className = "nv-row is-org has-actions";
        row.appendChild(marker(org));

        // Real URL so middle-click / ⌘-click / "open in new tab" open the ORG
        // (not popup.html#); plain left-clicks are intercepted below.
        const link = document.createElement("a");
        link.className = "nv-row-link";
        if (SFEN_URL.isOrgHost(org.host)) link.href = "https://" + org.host;
        link.appendChild(orgText(org.host, name, type));
        link.addEventListener("click", (e) => {
            if (e.button !== 0 || e.shiftKey) return;
            e.preventDefault();
            openOrg(org.host, e.metaKey || e.ctrlKey);
        });
        row.appendChild(link);

        const here = !offSalesforce && SFEN_ORGS.shortHost(org.host) === currentShort;
        if (here) {
            const badge = document.createElement("span");
            badge.className = "nv-row-badge";
            badge.textContent = "This tab";
            row.appendChild(badge);
        }
        if (org.pinned) {
            const mark = document.createElement("span");
            mark.className = "nv-pinned-mark";
            mark.setAttribute("aria-label", "Pinned");
            mark.innerHTML = icon("pin", 14);
            row.appendChild(mark);
        }

        const acts = document.createElement("span");
        acts.className = "nv-row-actions";
        const mk = (iconName, label, onClick) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "nv-icon-btn";
            b.title = label;
            b.setAttribute("aria-label", `${label} ${name}`);
            b.innerHTML = icon(iconName, 15);
            b.addEventListener("click", onClick);
            acts.appendChild(b);
        };
        // The page you're on, in this org: compare a Setup page across orgs.
        const samePage = !offSalesforce && !here && currentUrl ? SFEN_ORGS.samePageUrl(org, currentUrl) : null;
        if (samePage) {
            mk("external", "Open this page here", (e) => {
                const background = e.metaKey || e.ctrlKey;
                chrome.tabs.create({ url: samePage, active: !background });
                if (!background) window.SFEN_POPUP_READY.then((r) => r.settings.autoClose && window.close());
            });
        }
        mk("pin", org.pinned ? "Unpin" : "Pin", () => update(org, { pinned: !org.pinned }));
        mk("pencil", "Rename", () => startRename(row, org));
        mk("x", "Remove", () => removeOrg(row, org));
        row.appendChild(acts);
        return row;
    }

    function group(text, gap) {
        const g = document.createElement("div");
        g.className = "nv-group" + (gap ? " nv-group-gap" : "");
        g.textContent = text;
        return g;
    }

    function render() {
        const section = $("quickLogin");
        if (!section) return;
        section.innerHTML = "";

        if (!savedOrgs.length) {
            section.className = "nv-empty";
            section.innerHTML =
                '<div class="nv-empty-body">' +
                icon("plus", 28, 1.6) +
                '<span class="nv-empty-title">No saved orgs yet</span>' +
                '<span class="nv-empty-text">Save the orgs you use, then open any of them in one click.</span>' +
                '<button type="button" class="nv-btn-primary">Add org</button>' +
                "</div>";
            section.querySelector("button").addEventListener("click", openAdd);
            return;
        }
        section.className = "";

        const q = query.trim().toLowerCase();
        const matched = savedOrgs.filter(
            (o) => !q || (SFEN_ORGS.displayName(o) + " " + o.host).toLowerCase().includes(q)
        );
        const pinned = matched.filter((o) => o.pinned);
        const rest = matched.filter((o) => !o.pinned);
        if (pinned.length) section.appendChild(group("Pinned"));
        pinned.forEach((o) => section.appendChild(buildRow(o)));
        if (pinned.length && rest.length) section.appendChild(group("All orgs", true));
        rest.forEach((o) => section.appendChild(buildRow(o)));
        if (!matched.length) section.appendChild(Object.assign(document.createElement("div"), {
            className: "nv-note",
            textContent: `No orgs match “${query.trim()}”`,
        }));

        const foot = document.createElement("div");
        foot.className = "nv-footnote";
        foot.textContent = offSalesforce
            ? "Open a Salesforce tab to search Setup and objects."
            : "Names and pins sync across your Chrome profile.";
        section.appendChild(foot);
    }

    // ---- Add an org (full-popup view) ---------------------------------
    function closeAdd() {
        const view = $("addOrgView");
        if (view) view.remove();
        document.body.classList.remove("is-adding");
        render();
    }

    function openAdd() {
        if (savedOrgs.length >= MAX_ORGS) return toast(`You can save up to ${MAX_ORGS} orgs`);
        document.body.classList.add("is-adding");
        const view = document.createElement("div");
        view.id = "addOrgView";
        view.className = "nv-add-view";
        view.innerHTML =
            '<header class="nv-subheader">' +
            `<button type="button" class="nv-icon-btn" aria-label="Back to orgs">${icon("chevronLeft", 18, 2)}</button>` +
            '<span class="nv-subheader-title">Add an org</span>' +
            "</header>" +
            '<main class="nv-main nv-add-org">' +
            '<div id="addDetected"></div>' +
            '<div class="nv-field">' +
            '<label for="orgUrl">Paste a My Domain or login URL</label>' +
            '<input id="orgUrl" class="nv-input" type="text" autocomplete="off" spellcheck="false" placeholder="acme.my.salesforce.com">' +
            '<div id="orgPreview" class="nv-preview"></div>' +
            '<div class="nv-form-actions">' +
            '<button id="orgCancel" type="button" class="nv-btn-quiet">Cancel</button>' +
            '<button id="orgSave" type="button" class="nv-btn-primary" disabled>Save org</button>' +
            "</div></div>" +
            '<div class="nv-footnote">Only the name and address are saved. You can rename any org later.</div>' +
            "</main>";
        document.body.appendChild(view);
        view.querySelector(".nv-subheader button").addEventListener("click", closeAdd);
        $("orgCancel").addEventListener("click", closeAdd);

        const input = $("orgUrl");
        const preview = () => {
            const host = cleanHost(input.value);
            const ok = SFEN_URL.isOrgHost(host);
            $("orgSave").disabled = !ok;
            const box = $("orgPreview");
            if (!ok) return (box.innerHTML = "");
            const type = SFEN_ORGS.orgType({ host, isSandbox: /--|\.sandbox\./.test(host) });
            box.innerHTML = `<span class="nv-dot ${type}"></span>Saves as <b></b> · <span></span>`;
            box.querySelector("b").textContent = SFEN_ORGS.defaultName(host);
            box.querySelector("span:last-child").textContent = SFEN_ORGS.TYPES[type];
        };
        const save = () => {
            const host = cleanHost(input.value);
            if (saveOrg(host, /--|\.sandbox\./.test(host))) closeAdd();
        };
        input.addEventListener("input", preview);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") save();
        });
        $("orgSave").addEventListener("click", save);
        renderDetected();
        input.focus();
    }

    // Orgs with a live session in this browser that aren't saved yet.
    function renderDetected() {
        const box = $("addDetected");
        if (!box) return;
        box.innerHTML = "";
        const suggestions = detected.filter((o) => !isSaved(o.lightningHost));
        if (!suggestions.length) return;
        box.appendChild(group("Open in this browser"));
        suggestions.forEach((o) => {
            const org = { host: o.lightningHost, isSandbox: o.isSandbox };
            const type = SFEN_ORGS.orgType(org);
            const row = document.createElement("div");
            row.className = "nv-row is-org has-actions";
            row.innerHTML = `<span class="nv-dot ${type}"></span>`;
            row.appendChild(orgText(org.host, SFEN_ORGS.defaultName(org.host), type));
            const add = document.createElement("button");
            add.type = "button";
            add.className = "nv-btn-secondary nv-btn-add";
            add.textContent = "Add";
            add.addEventListener("click", () => {
                if (saveOrg(org.host, org.isSandbox)) closeAdd();
            });
            row.appendChild(add);
            box.appendChild(row);
        });
        const divider = document.createElement("div");
        divider.className = "nv-divider";
        box.appendChild(divider);
    }

    // Re-render if the saved list changes elsewhere (another popup, Settings, sync).
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync") return;
        if (changes.quickOrgs) savedOrgs = changes.quickOrgs.newValue || [];
        if (changes.orgColors) storedColors = changes.orgColors.newValue || {};
        if (changes.settings) colorsOn = SFEN_SETTINGS.normalize(changes.settings.newValue).orgTabColors;
        if (changes.quickOrgs || changes.orgColors || changes.settings) render();
    });

    // Resolves once the saved list is loaded (detected orgs fill in later).
    async function initQuickLogin(opts) {
        offSalesforce = !!(opts && opts.offSalesforce);
        currentShort = SFEN_ORGS.shortHost((opts && opts.currentHost) || "");
        currentUrl = (opts && opts.currentUrl) || "";
        const stored = await new Promise((resolve) =>
            chrome.storage.sync.get({ quickOrgs: [], orgColors: {}, settings: null }, (r) => resolve(r || {}))
        );
        savedOrgs = stored.quickOrgs || [];
        storedColors = stored.orgColors || {};
        colorsOn = SFEN_SETTINGS.normalize(stored.settings).orgTabColors;
        render(); // paint the saved list immediately
        detectOrgs().then((list) => {
            detected = list;
            renderDetected(); // enrich the add view if it's already open
        });
    }

    window.initQuickLogin = initQuickLogin;
    window.SFEN_ORGS_TAB = {
        filter(q) {
            query = q || "";
            render();
        },
        openAdd,
        marker,
        // Saved org for a host, if any (used by the header org switcher).
        find(host) {
            const short = SFEN_ORGS.shortHost(host);
            return savedOrgs.find((o) => SFEN_ORGS.shortHost(o.host) === short) || null;
        },
    };
})();
