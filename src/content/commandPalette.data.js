// commandPalette.data.js
// Static catalog, embedded styles, icons, and pure (stateless) helpers for the
// Option/Alt+K command palette. Loaded before commandPalette.js (see manifest
// content_scripts order) and exposed on the shared isolated-world global for it
// to consume.
(function () {
    "use strict";

    // Styles are embedded (not loaded via <link>) so they apply synchronously
    // on the very first open — no flash of unstyled, oversized icons.
    const PALETTE_CSS = `
:host { all: initial;
  --nv-surface:#FFFFFF; --nv-surface-2:#F3F5F8; --nv-surface-3:#E7EBF0; --nv-border:#E4E8EE;
  --nv-text:#1F2937; --nv-text-2:#4B5563; --nv-text-3:#5F6B7A; --nv-primary:#0073A8;
  --nv-primary-text:#0073A8; --nv-sel:#E6F5FC; --nv-on-sel:#1F2937; --nv-on-sel-2:#5F6B7A;
  --nv-sel-icon:#0073A8; --nv-mark:#CCEEFB; --nv-success:#15803D; --nv-danger:#B42318; --nv-on-primary:#FFFFFF;
  --nv-env-prod:#E5484D; --nv-env-sandbox:#F59E0B; --nv-env-scratch:#8B5CF6; --nv-env-dev:#14B8A6; --nv-env-other:#94A3B8;
  --nv-shadow-lg:0 20px 48px rgba(15,23,42,0.16), 0 2px 6px rgba(15,23,42,0.06);
  --nv-scrim:rgba(15,23,42,0.28); }
:host([data-theme="dark"]) {
  --nv-surface:#1A1F28; --nv-surface-2:#222834; --nv-surface-3:#2B3240; --nv-border:#2A303B;
  --nv-text:#E5E9F0; --nv-text-2:#B6BFCC; --nv-text-3:#8C97A7; --nv-primary:#33B3E6;
  --nv-primary-text:#5CC4EE; --nv-sel:#1C3342; --nv-on-sel:#E5E9F0; --nv-on-sel-2:#B6BFCC;
  --nv-sel-icon:#5CC4EE; --nv-mark:rgba(51,179,230,0.28); --nv-success:#4ADE80; --nv-danger:#F87171; --nv-on-primary:#0B1320;
  --nv-env-prod:#F87171; --nv-env-sandbox:#FBBF24; --nv-env-scratch:#A78BFA; --nv-env-dev:#2DD4BF; --nv-env-other:#8C97A7;
  --nv-shadow-lg:0 20px 48px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.3);
  --nv-scrim:rgba(0,0,0,0.45); }
.backdrop { display:none; position:fixed; inset:0; z-index:2147483647; background:var(--nv-scrim);
  justify-content:center; align-items:flex-start; color:var(--nv-text);
  font-family:"Figtree","Segoe UI",system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
:host(.open) .backdrop { display:flex; }
:host([data-theme="dark"]) .backdrop { color-scheme:dark; }
.panel { margin-top:12vh; width:640px; max-width:92vw; max-height:64vh; box-sizing:border-box;
  display:flex; flex-direction:column; background:var(--nv-surface); border:1px solid var(--nv-border);
  border-radius:12px; box-shadow:var(--nv-shadow-lg); overflow:hidden;
  animation:sfen-pop 0.14s cubic-bezier(0.2,0.8,0.2,1); }
.panel.board-mode { width:720px; }
@keyframes sfen-pop { from { opacity:0; transform:translateY(-8px) scale(0.985); }
  to { opacity:1; transform:translateY(0) scale(1); } }
.mono { font-family:"JetBrains Mono",monospace; }
.search-wrap { display:flex; align-items:center; gap:12px; height:56px; flex-shrink:0; box-sizing:border-box;
  padding:0 16px; border-bottom:1px solid var(--nv-border); }
.search-wrap > svg { color:var(--nv-text-3); flex-shrink:0; }
.search { border:none; outline:none; flex:1; min-width:0; padding:0; font:400 16px "Figtree","Segoe UI",system-ui,sans-serif;
  color:var(--nv-text); background:transparent; }
.search::placeholder { color:var(--nv-text-3); }
.loader { width:16px; height:16px; flex-shrink:0; box-sizing:border-box; border:2px solid var(--nv-border);
  border-top-color:var(--nv-primary); border-radius:50%; opacity:0; transition:opacity 0.15s; }
.loader.on { opacity:1; animation:sfen-spin 0.7s linear infinite; }
@keyframes sfen-spin { to { transform:rotate(360deg); } }
.results { list-style:none; margin:0; padding:8px; overflow-y:auto; scrollbar-width:thin; }
.panel.board-mode .results { padding-top:0; }
.results::-webkit-scrollbar { width:8px; }
.results::-webkit-scrollbar-thumb { background:var(--nv-surface-3); border-radius:8px; }
.group-header { display:flex; align-items:center; height:28px; padding:0 10px; font-size:12px;
  font-weight:600; color:var(--nv-text-3); user-select:none; }
.result + .group-header { margin-top:8px; }
.board { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; padding-bottom:2px; }
.column { display:flex; flex-direction:column; min-width:0; }
.result { display:flex; align-items:center; gap:10px; height:36px; box-sizing:border-box; padding:0 10px;
  border-radius:8px; color:var(--nv-text); cursor:pointer; }
.result:has(.sub) { height:44px; }
.result:hover { background:var(--nv-surface-2); }
.result.active { background:var(--nv-sel); color:var(--nv-on-sel); }
.result .icon { width:16px; height:16px; color:var(--nv-text-3); flex-shrink:0; display:inline-flex; }
.result .icon svg { width:16px; height:16px; }
.result.active .icon, .result.active .enter { color:var(--nv-sel-icon); }
.label-wrap { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.label { font-size:14px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.label .api { margin-left:4px; font-size:11px; font-weight:400; color:var(--nv-text-3); }
mark { background:var(--nv-mark); color:inherit; border-radius:3px; padding:0 1px; }
.sub { font-size:12px; color:var(--nv-text-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hint { font-size:12px; color:var(--nv-text-3); flex-shrink:0; white-space:nowrap; }
.result.active .hint, .result.active .sub, .result.active .label .api { color:var(--nv-on-sel-2); }
.enter { display:none; width:14px; height:14px; flex-shrink:0; }
.result.active .enter { display:inline-flex; }
.more { flex-shrink:0; background:transparent; border:none; color:var(--nv-text-3); cursor:pointer;
  padding:2px 6px; border-radius:6px; font-size:15px; line-height:1; font-family:inherit; }
.more:hover { background:var(--nv-surface-3); color:var(--nv-text); }
.result.subaction { padding-left:36px; }
.result.subaction .label { font-size:13px; }
.empty { list-style:none; display:flex; flex-direction:column; align-items:center; gap:6px;
  padding:36px 32px 28px; text-align:center; }
.empty svg { width:26px; height:26px; color:var(--nv-text-3); }
.empty-title { margin-top:8px; font-size:15px; font-weight:600; color:var(--nv-text); }
.empty-body { max-width:420px; font-size:13px; line-height:1.55; color:var(--nv-text-3); }
.empty-body .mono, .cmd-bar .cmd-verb { color:var(--nv-primary-text); }
.footer { display:flex; align-items:center; gap:18px; height:36px; flex-shrink:0; box-sizing:border-box;
  padding:0 18px; border-top:1px solid var(--nv-border); font-size:12px; color:var(--nv-text-3);
  white-space:nowrap; overflow:hidden; }
kbd { font:inherit; color:var(--nv-text-2); margin-right:2px; }
.footer-count { margin-left:auto; }
.scope-chip { display:inline-flex; align-items:center; gap:6px; flex-shrink:0; height:26px; box-sizing:border-box;
  padding:0 6px 0 10px; border:0; border-radius:6px; background:var(--nv-sel); color:var(--nv-primary-text);
  font:600 13px "Figtree","Segoe UI",system-ui,sans-serif; cursor:pointer; }
.scope-chip .chip-x { display:inline-flex; width:12px; height:12px; opacity:0.8; }
.scope-chip:hover .chip-x { opacity:1; }
.search-wrap:has(.scope-chip) { gap:10px; }
.cmd-bar { min-height:40px; line-height:40px; padding:0 10px; font-size:12px; color:var(--nv-text-3); }
.cmd-verb { background:none; border:0; padding:0; cursor:pointer; font:inherit; font-family:"JetBrains Mono",monospace; }
.cmd-verb:hover { text-decoration:underline; }
.inspector { padding:0; }
.insp-head { display:flex; align-items:center; gap:12px; padding:6px 10px 10px; }
.insp-title-wrap { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.insp-title { font-size:15px; font-weight:600; color:var(--nv-text); }
.insp-type { font-size:12px; color:var(--nv-text-3); }
.insp-type .mono { font-size:11px; }
.insp-row { display:grid; grid-template-columns:210px minmax(0,1fr) 64px; align-items:center; min-height:40px;
  box-sizing:border-box; padding:4px 10px; border-top:1px solid var(--nv-border); }
.insp-row:hover { background:var(--nv-surface-2); border-radius:6px; }
.insp-key { min-width:0; font-size:12px; color:var(--nv-text); word-break:break-word; }
.insp-val { min-width:0; font-size:13px; color:var(--nv-text); word-break:break-word; white-space:pre-wrap;
  font-variant-numeric:tabular-nums; }
.insp-val.dim { color:var(--nv-text-3); }
.insp-copy { justify-self:end; visibility:hidden; height:26px; padding:0 8px; border:0; border-radius:6px;
  background:transparent; color:var(--nv-primary-text); font:600 12px "Figtree","Segoe UI",system-ui,sans-serif; cursor:pointer; }
.insp-row:hover .insp-copy, .insp-copy.copied, .insp-copy.failed { visibility:visible; }
.insp-copy.copied, .insp-action.copied { color:var(--nv-success); cursor:default; }
.insp-copy.failed, .insp-action.failed { color:var(--nv-danger); cursor:default; }
.insp-action { flex-shrink:0; height:30px; padding:0 10px; border:0; border-radius:6px; background:transparent;
  color:var(--nv-primary-text); font:600 12px "Figtree","Segoe UI",system-ui,sans-serif; cursor:pointer; }
.insp-key.labeled { display:flex; flex-direction:column; font-family:inherit; }
.insp-label { font-size:13px; font-weight:500; }
.insp-api { font-size:11px; color:var(--nv-text-3); }
.org { display:inline-flex; align-items:center; gap:7px; flex-shrink:0; font-size:12px; font-weight:500;
  color:var(--nv-text-3); white-space:nowrap; }
.org[hidden] { display:none; }
.org-dot { width:8px; height:8px; border-radius:50%; background:var(--nv-env-other); }
.org-dot.production { background:var(--nv-env-prod); }
.org-dot.sandbox { background:var(--nv-env-sandbox); }
.org-dot.scratch { background:var(--nv-env-scratch); }
.org-dot.developer { background:var(--nv-env-dev); }
.result.login-row { height:48px; }
.result.login-row.active { padding-right:8px; }
.result.login-row.disabled { color:var(--nv-text-3); cursor:default; }
.result.login-row.disabled:hover { background:transparent; }
.login-btn { display:none; flex-shrink:0; height:30px; padding:0 12px; border:0; border-radius:8px;
  background:var(--nv-primary); color:var(--nv-on-primary); font:600 12px "Figtree","Segoe UI",system-ui,sans-serif; cursor:pointer; }
.login-btn.secondary { border:1px solid var(--nv-border); background:var(--nv-surface); color:var(--nv-text); }
.result.login-row.active .login-btn { display:inline-block; }
`;

    // ---- Navigation ------------------------------------------------------
    function lightningOrigin() {
        let origin = window.location.origin;
        if (origin.includes("my.salesforce-setup.com")) {
            origin = origin.replace(
                "my.salesforce-setup.com",
                "lightning.force.com"
            );
        }
        return origin;
    }

    function navigate(url, newTab) {
        const full = /^https?:\/\//.test(url) ? url : lightningOrigin() + url;
        if (newTab) window.open(full, "_blank");
        else window.location.href = full;
    }

    // Lightning URL for a record. Users open on their Setup detail page (the
    // /lightning/r/User/... route renders poorly); everything else uses the
    // standard record view.
    function recordUrl(type, id) {
        if (type === "User") {
            return `/lightning/setup/ManageUsers/page?address=%2F${id}%3Fnoredirect%3D1`;
        }
        return `/lightning/r/${type}/${id}/view`;
    }

    // ---- Static catalog --------------------------------------------------
    const GROUPS = {
        RECENT: "Recent",
        BOOKMARK: "Bookmarks",
        SETUP_TAB: "Setup Tabs",
        RECORD: "Records",
        OBJECT: "Objects",
        SETUP: "Setup",
        FLOW: "Flows",
        PROFILE: "Profiles",
        PERMSET: "Permission Sets",
        APP: "Apps",
        FIELD: "Fields",
        ACTION: "Actions",
    };

    // Master Setup list is shared with the popup; see src/shared/setupPages.js
    // (loaded first via the manifest). Entries are [label, url, category].
    const SETUP_PAGES = (typeof window !== "undefined" && window.SFEN_SETUP_PAGES) || [];

    // Fallback object list when live access is off/unavailable.
    const FALLBACK_OBJECTS = [
        "Account", "Contact", "Lead", "Opportunity", "Case", "Campaign",
        "Contract", "Order", "Product2", "Asset", "Task", "Event", "User", "Quote",
    ];

    // System / non-navigable object suffixes to hide from the live list.
    const OBJECT_NOISE = /(ChangeEvent|__Share|__History|__Feed|__Tag|Share|History|Feed|__e|__mdt|__b|__x)$/;
    function isRelevantObject(s) {
        return (
            s.queryable === true &&
            s.layoutable === true &&
            !!s.keyPrefix &&
            !s.deprecatedAndHidden &&
            !OBJECT_NOISE.test(s.name)
        );
    }

    // Object rows show the label, plus the API name in mono when it differs.
    function objectEntries(api, label) {
        return [
            {
                label: label || api,
                api: label && label !== api ? api : "",
                hint: "Object",
                group: GROUPS.OBJECT,
                url: `/lightning/o/${api}/home`,
                keywords: `${api} ${label || ""} list view records new create fields object manager schema`,
                actions: [
                    { label: "Open list view", hint: "List", kind: "nav", url: `/lightning/o/${api}/home` },
                    { label: "New record", hint: "New", kind: "nav", url: `/lightning/o/${api}/new?useRecordTypeCheck=1` },
                    { label: "Fields & Relationships", hint: "Fields", kind: "nav", url: `/lightning/setup/ObjectManager/${api}/FieldsAndRelationships/view` },
                ],
            },
        ];
    }

    // ---- Command verbs ---------------------------------------------------
    // Typed verbs (e.g. "new account") run a single action against an object.
    // "record" inspects the current record instead (handled in the palette);
    // its chip shows the live record's object name, not a generic label.
    const VERB_URL = {
        new: (api) => `/lightning/o/${api}/new?useRecordTypeCheck=1`,
        list: (api) => `/lightning/o/${api}/home`,
        fields: (api) => `/lightning/setup/ObjectManager/${api}/FieldsAndRelationships/view`,
    };
    const VERB_HINT = { new: "New", list: "List", fields: "Fields" };
    const VERBS = {
        new: { kind: "object", action: "new", label: "New" },
        list: { kind: "object", action: "list", label: "List" },
        fields: { kind: "object", action: "fields", label: "Fields" },
        app: { kind: "app", label: "App" }, // the user's Lightning apps
        apps: { kind: "app", label: "App" }, // alias of app
        login: { kind: "login", label: "Log in as" }, // users from the "users" lookup
        record: { kind: "inspect", label: "Record" },
        json: { kind: "inspect", label: "Record" }, // alias of record
        api: { kind: "inspect", label: "Record" }, // alias of record
    };

    // How well `q` names object `o`. The plural label counts too, so
    // "contacts" finds Contact rather than Contact Request.
    function objectScore(q, o) {
        return Math.max(
            SFEN_URL.matchScore(q, o.label || o.api, o.api),
            o.plural ? SFEN_URL.matchScore(q, o.plural, o.api) : -1
        );
    }

    // One result per object matching `arg`, navigating to the verb's destination.
    function objectVerbEntries(action, objects, arg) {
        const q = (arg || "").trim().toLowerCase();
        const scored = [];
        objects.forEach((o) => {
            const sc = q ? objectScore(q, o) : 0;
            if (sc < 0) return;
            scored.push({
                sc,
                item: {
                    label: o.label || o.api,
                    api: o.label && o.label !== o.api ? o.api : "",
                    hint: VERB_HINT[action],
                    group: GROUPS.OBJECT,
                    url: VERB_URL[action](o.api),
                    keywords: `${o.api} ${o.label || ""}`,
                    objectApi: o.api, // the "fields" verb's Tab completes to this object
                },
            });
        });
        scored.sort((a, b) => b.sc - a.sc);
        return scored.map((s) => s.item);
    }

    // ---- Fuzzy matching --------------------------------------------------
    // Scoring is SFEN_URL.fuzzy (src/shared/sfUrl.js).

    // Match positions within the label only, for highlighting.
    function highlightPositions(query, label) {
        const lower = label.toLowerCase();
        // Prefer the literal match ("Contact Roles on Opportunities" for
        // "opportuni"), so letters aren't scattered across earlier words.
        const at = query ? lower.indexOf(query) : -1;
        if (at >= 0) return Array.from(query, (_, i) => at + i);
        const pos = [];
        let qi = 0;
        for (let i = 0; i < lower.length && qi < query.length; i++) {
            if (lower[i] === query[qi]) {
                pos.push(i);
                qi++;
            }
        }
        return qi === query.length ? pos : [];
    }

    // ---- Record Ids ------------------------------------------------------
    // A pasted token that looks like a record Id: an 18-char Id must end in
    // the checksum of its first 15 characters' casing; a 15-char Id must mix
    // letters and digits (so ordinary 15-letter words don't match).
    function looksLikeRecordId(s) {
        if (!/^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(s)) return false;
        if (s.length === 15) return /\d/.test(s) && /[a-zA-Z]/.test(s);
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
        let suffix = "";
        for (let i = 0; i < 15; i += 5) {
            let bits = 0;
            for (let j = 0; j < 5; j++) if (/[A-Z]/.test(s[i + j])) bits |= 1 << j;
            suffix += chars[bits];
        }
        return suffix === s.slice(15).toUpperCase();
    }

    // ---- Icons -----------------------------------------------------------
    // Lucide-style 24px stroke shapes.
    const WRENCH = '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>';
    const ICONS = {
        [GROUPS.RECENT]: WRENCH,
        [GROUPS.BOOKMARK]: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
        [GROUPS.SETUP_TAB]: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/>',
        [GROUPS.RECORD]: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
        [GROUPS.OBJECT]: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
        [GROUPS.SETUP]: WRENCH,
        [GROUPS.FLOW]: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
        [GROUPS.PROFILE]: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        [GROUPS.PERMSET]: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
        [GROUPS.APP]: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
        [GROUPS.FIELD]: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
        [GROUPS.ACTION]: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    };
    function svg(size, strokeWidth, body) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    }
    function iconSvg(group) {
        return svg(16, 1.8, ICONS[group] || ICONS[GROUPS.SETUP]);
    }
    const SEARCH_PATH = '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>';
    const UI_ICONS = {
        search: svg(18, 2, SEARCH_PATH),
        searchLarge: svg(26, 1.6, SEARCH_PATH),
        enter: svg(14, 2, '<path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/>'),
        close: svg(12, 2.4, '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    };

    function escapeHtml(s) {
        return s.replace(
            /[&<>]/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])
        );
    }

    window.SFEN_CMDK_DATA = {
        PALETTE_CSS,
        GROUPS,
        SETUP_PAGES,
        FALLBACK_OBJECTS,
        OBJECT_NOISE,
        ICONS,
        UI_ICONS,
        VERBS,
        isRelevantObject,
        objectEntries,
        objectScore,
        objectVerbEntries,
        iconSvg,
        looksLikeRecordId,
        highlightPositions,
        escapeHtml,
        lightningOrigin,
        navigate,
        recordUrl,
    };
})();
