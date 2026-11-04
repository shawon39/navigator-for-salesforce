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
  --nv-text:#111827; --nv-text-2:#4B5563; --nv-text-3:#5F6B7A; --nv-primary:#0B63CE;
  --nv-primary-text:#0B63CE; --nv-sel:#EAF2FD; --nv-on-sel:#111827; --nv-on-sel-2:#5F6B7A;
  --nv-sel-icon:#0B63CE; --nv-mark:#D3E4FB; --nv-success:#15803D; --nv-warning:#B45309; --nv-danger:#B42318; --nv-on-primary:#FFFFFF;
  --nv-env-prod:#E5484D; --nv-env-sandbox:#F59E0B; --nv-env-scratch:#8B5CF6; --nv-env-dev:#14B8A6; --nv-env-other:#94A3B8;
  --nv-key:#FFFFFF; --nv-key-border:#DCE0E6;
  --nv-tone-setup:#4B5563; --nv-tone-setup-bg:#F0F2F5; --nv-tone-obj:#0B63CE; --nv-tone-obj-bg:#E6F0FC;
  --nv-tone-rec:#0B7068; --nv-tone-rec-bg:#E3F4F1; --nv-tone-book:#A15C07; --nv-tone-book-bg:#FDF1DE;
  --nv-tone-flow:#6E3FD1; --nv-tone-flow-bg:#EFEAFC;
  --nv-tag-prod:#B42318; --nv-tag-prod-bg:#FDECEA; --nv-tag-sandbox:#B54708; --nv-tag-sandbox-bg:#FEF3E2;
  --nv-shadow-lg:0 20px 48px rgba(15,23,42,0.16), 0 2px 6px rgba(15,23,42,0.06);
  --nv-scrim:rgba(15,23,42,0.28); }
:host([data-theme="dark"]) {
  --nv-surface:#1A1F28; --nv-surface-2:#222834; --nv-surface-3:#2B3240; --nv-border:#2A303B;
  --nv-text:#E5E9F0; --nv-text-2:#B6BFCC; --nv-text-3:#8C97A7; --nv-primary:#6AA5F2;
  --nv-primary-text:#6AA5F2; --nv-sel:#1B2C45; --nv-on-sel:#E5E9F0; --nv-on-sel-2:#B6BFCC;
  --nv-sel-icon:#6AA5F2; --nv-mark:rgba(106,165,242,0.3); --nv-success:#4ADE80; --nv-warning:#FBBF24; --nv-danger:#F87171; --nv-on-primary:#0B1320;
  --nv-env-prod:#F87171; --nv-env-sandbox:#FBBF24; --nv-env-scratch:#A78BFA; --nv-env-dev:#2DD4BF; --nv-env-other:#8C97A7;
  --nv-key:#222834; --nv-key-border:#3A4150;
  --nv-tone-setup:#B6BFCC; --nv-tone-setup-bg:#2B3240; --nv-tone-obj:#6AA5F2; --nv-tone-obj-bg:#1B2C45;
  --nv-tone-rec:#2DD4BF; --nv-tone-rec-bg:#14302C; --nv-tone-book:#FBBF24; --nv-tone-book-bg:#3A2A12;
  --nv-tone-flow:#A78BFA; --nv-tone-flow-bg:#2A2245;
  --nv-tag-prod:#F87171; --nv-tag-prod-bg:#3A1D20; --nv-tag-sandbox:#FBBF24; --nv-tag-sandbox-bg:#3A2A12;
  --nv-shadow-lg:0 20px 48px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.3);
  --nv-scrim:rgba(0,0,0,0.45); }
.backdrop { display:none; position:fixed; inset:0; z-index:2147483647; background:var(--nv-scrim);
  justify-content:center; align-items:flex-start; color:var(--nv-text);
  font-family:"Figtree","Segoe UI",system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
:host(.open) .backdrop { display:flex; }
:host([data-theme="dark"]) .backdrop { color-scheme:dark; }
.panel { margin-top:12vh; width:720px; max-width:92vw; max-height:64vh; box-sizing:border-box;
  display:flex; flex-direction:column; background:var(--nv-surface); border:1px solid var(--nv-border);
  border-radius:12px; box-shadow:var(--nv-shadow-lg); overflow:hidden;
  animation:sfen-pop 0.14s cubic-bezier(0.2,0.8,0.2,1); }
.panel.peek-mode { width:960px; }
.body { display:flex; flex:1 1 auto; min-height:0; }
.peek { width:300px; flex-shrink:0; display:flex; flex-direction:column; box-sizing:border-box; padding:16px 16px 0;
  border-left:1px solid var(--nv-border); overflow-y:auto; scrollbar-width:thin; }
.peek[hidden] { display:none; }
.peek-head { display:flex; align-items:center; gap:10px; }
.peek-tile { width:34px; height:34px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center;
  border-radius:8px; background:var(--nv-sel); color:var(--nv-sel-icon); }
.peek-head-text { min-width:0; }
.peek-title { font-size:15px; font-weight:600; line-height:1.3; color:var(--nv-text); word-break:break-word; }
.peek-type { margin-top:1px; font-size:12px; color:var(--nv-text-3); }
.peek-fields { margin-top:14px; border-top:1px solid var(--nv-border); }
.peek-field { position:relative; padding:8px 28px 8px 0; border-bottom:1px solid var(--nv-border); }
.peek-field:last-child { border-bottom:0; }
.peek-label { display:block; margin-bottom:2px; font-size:11px; color:var(--nv-text-3); word-break:break-word; }
.peek-val { font-size:13px; color:var(--nv-text); word-break:break-word; white-space:pre-wrap; }
.peek-val.dim { color:var(--nv-text-3); }
.peek-link { background:none; border:0; padding:0; font:inherit; font-size:13px; color:var(--nv-primary-text); cursor:pointer;
  text-align:left; word-break:break-word; }
.peek-link:hover { text-decoration:underline; }
.peek-actions { position:sticky; bottom:0; display:flex; flex-direction:column; gap:6px; margin-top:auto; padding:12px 0 14px;
  background:var(--nv-surface); }
.peek-row { display:flex; gap:6px; }
.peek-btn { flex:1; min-width:0; height:30px; display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:0 6px;
  border:1px solid var(--nv-border); border-radius:8px; background:transparent; color:var(--nv-text);
  font:600 12px "Figtree","Segoe UI",system-ui,sans-serif; cursor:pointer; }
.peek-btn span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.peek-btn svg { flex-shrink:0; color:var(--nv-text-2); }
.peek-btn:hover { background:var(--nv-surface-2); }
.peek-icon { position:absolute; right:0; top:50%; transform:translateY(-50%); width:24px; height:24px; display:inline-flex;
  align-items:center; justify-content:center; padding:0; border:0; border-radius:6px; background:transparent;
  color:var(--nv-text-3); cursor:pointer; opacity:0; }
.peek-field:hover .peek-icon, .peek-icon:focus-visible, .peek-icon.copied, .peek-icon.failed { opacity:1; }
.peek-icon:hover { background:var(--nv-surface-2); color:var(--nv-text); }
.peek-icon.copied { color:var(--nv-success); }
.peek-icon.failed { color:var(--nv-danger); }
.peek-note { padding:28px 4px; font-size:13px; line-height:1.5; color:var(--nv-text-3); text-align:center; }
@keyframes sfen-pop { from { opacity:0; transform:translateY(-8px) scale(0.985); }
  to { opacity:1; transform:translateY(0) scale(1); } }
.mono { font-family:"JetBrains Mono",monospace; }
.search-wrap { display:flex; align-items:center; gap:12px; height:52px; flex-shrink:0; box-sizing:border-box;
  padding:0 16px; border-bottom:1px solid var(--nv-border); }
.search-wrap > svg { color:var(--nv-text-3); flex-shrink:0; }
.search { border:none; outline:none; flex:1; min-width:0; padding:0; font:400 15px "Figtree","Segoe UI",system-ui,sans-serif;
  color:var(--nv-text); background:transparent; }
.search::placeholder { color:var(--nv-text-3); }
.loader { width:16px; height:16px; flex-shrink:0; box-sizing:border-box; border:2px solid var(--nv-border);
  border-top-color:var(--nv-primary); border-radius:50%; opacity:0; transition:opacity 0.15s; }
.loader.on { opacity:1; animation:sfen-spin 0.7s linear infinite; }
@keyframes sfen-spin { to { transform:rotate(360deg); } }
.results { flex:1; min-width:0; list-style:none; margin:0; padding:8px; overflow-y:auto; scrollbar-width:thin; }
.panel.board-mode .results { padding-top:0; }
.results::-webkit-scrollbar { width:8px; }
.results::-webkit-scrollbar-thumb { background:var(--nv-surface-3); border-radius:8px; }
.group-header { display:flex; align-items:center; gap:6px; height:28px; padding:0 8px; font-size:12px;
  font-weight:600; color:var(--nv-text-3); user-select:none; }
.group-count { font-weight:400; }
.result + .group-header, .result + .board { margin-top:8px; }
.pkg-toggle { display:inline-flex; align-items:center; gap:5px; margin-left:auto; font-weight:500; cursor:pointer; }
.pkg-toggle input { margin:0; accent-color:var(--nv-primary); cursor:pointer; }
.board { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; padding-bottom:2px; }
.column { display:flex; flex-direction:column; min-width:0; }
.result { display:flex; align-items:center; gap:10px; height:36px; box-sizing:border-box; padding:0 8px;
  border-radius:8px; color:var(--nv-text); cursor:pointer; }
.result:has(.sub) { height:44px; }
.result:hover { background:var(--nv-surface-2); }
.result.active { background:var(--nv-sel); color:var(--nv-on-sel); }
.result .icon { width:24px; height:24px; border-radius:6px; color:var(--nv-text-3); flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; }
.result .icon svg { width:14px; height:14px; }
.result.active .icon { color:var(--nv-sel-icon); }
/* Each kind of result has its own tile color, kept when the row is selected. */
.result .icon.tone-setup { background:var(--nv-tone-setup-bg); color:var(--nv-tone-setup); }
.result .icon.tone-obj { background:var(--nv-tone-obj-bg); color:var(--nv-tone-obj); }
.result .icon.tone-rec { background:var(--nv-tone-rec-bg); color:var(--nv-tone-rec); }
.result .icon.tone-book { background:var(--nv-tone-book-bg); color:var(--nv-tone-book); }
.result .icon.tone-flow { background:var(--nv-tone-flow-bg); color:var(--nv-tone-flow); }
.label-wrap { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.label { font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.api { flex:0 1 auto; min-width:0; max-width:40%; font-size:11px; color:var(--nv-text-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
mark { background:var(--nv-mark); color:inherit; border-radius:4px; padding:0 1px; }
.sub { font-size:12px; color:var(--nv-text-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hint { font-size:12px; color:var(--nv-text-3); flex-shrink:0; white-space:nowrap; }
.result.active .hint, .result.active .sub, .result.active .api { color:var(--nv-on-sel-2); }
.enter { display:none; flex-shrink:0; }
.result.active .enter { display:inline-flex; }
.more { display:none; align-items:center; gap:4px; flex-shrink:0; height:24px; padding:0 4px; border:0; border-radius:6px;
  background:transparent; color:var(--nv-text-2); font:500 12px "Figtree","Segoe UI",system-ui,sans-serif; cursor:pointer; }
.result.active .more { display:inline-flex; }
.more:hover { background:var(--nv-surface-3); color:var(--nv-text); }
.result.subaction { padding-left:42px; }
.result.subaction .label { font-size:13px; }
.empty { list-style:none; display:flex; flex-direction:column; align-items:center; gap:6px;
  padding:36px 32px 28px; text-align:center; }
.empty svg { width:26px; height:26px; color:var(--nv-text-3); }
.empty-title { margin-top:8px; font-size:15px; font-weight:600; color:var(--nv-text); }
.empty-body { max-width:420px; font-size:13px; line-height:1.55; color:var(--nv-text-3); }
.empty-body .mono { color:var(--nv-primary-text); }
.footer { display:flex; align-items:center; gap:16px; height:40px; flex-shrink:0; box-sizing:border-box;
  padding:0 16px; border-top:1px solid var(--nv-border); font-size:12px; color:var(--nv-text-3);
  white-space:nowrap; overflow:hidden; }
.fk { display:inline-flex; align-items:center; gap:4px; }
.fk kbd:last-of-type { margin-right:2px; }
kbd { display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:20px; box-sizing:border-box;
  padding:0 5px; border:1px solid var(--nv-key-border); border-bottom-width:2px; border-radius:4px; background:var(--nv-key);
  font:500 11px "Figtree","Segoe UI",system-ui,sans-serif; color:var(--nv-text-2); }
.footer-count { margin-left:auto; font-variant-numeric:tabular-nums; }
.scope-chip { display:inline-flex; align-items:center; gap:6px; flex-shrink:0; height:26px; box-sizing:border-box;
  padding:0 6px 0 10px; border:0; border-radius:6px; background:var(--nv-sel); color:var(--nv-primary-text);
  font:600 13px "Figtree","Segoe UI",system-ui,sans-serif; cursor:pointer; }
.scope-chip .chip-x { display:inline-flex; width:12px; height:12px; opacity:0.8; }
.scope-chip:hover .chip-x { opacity:1; }
.search-wrap:has(.scope-chip) { gap:10px; }
.cmd-bar { display:flex; flex-wrap:wrap; align-items:center; gap:6px 16px; padding:4px 8px 8px; }
.cmd-group { display:inline-flex; align-items:center; gap:4px; }
.cmd-label { margin-right:4px; font-size:12px; font-weight:500; color:var(--nv-text-3); }
.cmd-verb, .cmd-help { height:22px; padding:0 6px; border:0; border-radius:4px; white-space:nowrap; cursor:pointer; outline:0;
  transition:background-color 0.12s, color 0.12s; }
.cmd-verb { background:var(--nv-surface-2); color:var(--nv-text); font:500 12px "JetBrains Mono",monospace; }
.cmd-verb:hover, .cmd-verb:focus-visible { background:var(--nv-sel); color:var(--nv-primary-text); }
.cmd-help { margin-left:auto; padding:0 2px; background:none; color:var(--nv-primary-text);
  font:500 12px "Figtree","Segoe UI",system-ui,sans-serif; }
.cmd-help:hover, .cmd-help:focus-visible { text-decoration:underline; }
.cmd-verb:focus-visible, .cmd-help:focus-visible, .help-back:focus-visible, .help-name:focus-visible {
  outline:0; box-shadow:0 0 0 2px var(--nv-primary); }
.help { padding:10px 10px 14px; color:var(--nv-text); font-size:13px; }
.help-head { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
.help-title { font:600 15px "Figtree","Segoe UI",system-ui,sans-serif; color:var(--nv-text); }
.help-back { margin-left:auto; height:26px; padding:0 10px; border:1px solid var(--nv-border); border-radius:6px; background:none;
  color:var(--nv-text-2); cursor:pointer; font:500 12px "Figtree","Segoe UI",system-ui,sans-serif; }
.help-back:hover { background:var(--nv-surface-2); }
.help code { font:12px "JetBrains Mono",monospace; padding:3px 8px; border-radius:4px; background:var(--nv-surface-2); color:var(--nv-text); }
.help-intro { margin:-4px 0 10px; font-size:13px; color:var(--nv-text-2); }
.help-row { display:grid; grid-template-columns:80px 36px minmax(0,1fr) 190px; gap:12px; align-items:center; min-height:32px;
  border-top:1px solid var(--nv-border); }
.help-text { font-size:13px; color:var(--nv-text-2); }
.help-row code { justify-self:start; }
.help-short { font:12px "JetBrains Mono",monospace; color:var(--nv-text-3); }
.help-name { justify-self:start; padding:0; border:0; background:none; color:var(--nv-primary-text); cursor:pointer;
  font:500 12px "JetBrains Mono",monospace; }
.help-name:hover { text-decoration:underline; }
.limit { display:grid; grid-template-columns:minmax(0,210px) minmax(0,1fr) 132px 40px; gap:12px; align-items:center;
  height:30px; padding:0 10px; font-size:13px; color:var(--nv-text); }
.limit-name { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.limit-bar { height:6px; border-radius:3px; background:var(--nv-surface-3); overflow:hidden; }
.limit-bar span { display:block; height:100%; border-radius:3px; background:var(--nv-success); }
.limit.mid .limit-bar span { background:var(--nv-warning); }
.limit.high .limit-bar span { background:var(--nv-danger); }
.limit-num, .limit-pct { text-align:right; font-size:12px; font-variant-numeric:tabular-nums; }
.limit-num { color:var(--nv-text-3); }
.limit-pct { font-weight:600; }
.limit.mid .limit-pct { color:var(--nv-warning); }
.limit.high .limit-pct { color:var(--nv-danger); }
.limit.unused, .limit.unused .limit-pct { color:var(--nv-text-3); font-weight:400; }
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
.notice { display:flex; align-items:center; gap:8px; flex-shrink:0; padding:8px 10px 8px 16px; border-bottom:1px solid var(--nv-border);
  background:var(--nv-surface-2); font-size:12px; line-height:1.45; color:var(--nv-text-2); }
.notice[hidden] { display:none; }
.notice-text { flex:1; min-width:0; }
.notice-btn { flex-shrink:0; height:26px; padding:0 10px; border:0; border-radius:6px; background:transparent;
  color:var(--nv-primary-text); font:600 12px "Figtree","Segoe UI",system-ui,sans-serif; cursor:pointer; }
.notice-btn.primary { background:var(--nv-primary); color:var(--nv-on-primary); }
.org { display:inline-flex; align-items:center; gap:8px; flex-shrink:0; font-size:12px; font-weight:500;
  color:var(--nv-text-2); white-space:nowrap; }
.org[hidden] { display:none; }
/* The type tag names the org's type, so the search bar needs no type dot. */
.org > .org-dot { display:none; }
.org-tag { height:20px; padding:0 6px; border-radius:4px; font-size:11px; font-weight:600; line-height:20px;
  background:var(--nv-tone-setup-bg); color:var(--nv-tone-setup); }
.org-tag:empty { display:none; }
.org-tag.production { background:var(--nv-tag-prod-bg); color:var(--nv-tag-prod); }
.org-tag.sandbox { background:var(--nv-tag-sandbox-bg); color:var(--nv-tag-sandbox); }
.org-tag.developer { background:var(--nv-tone-rec-bg); color:var(--nv-tone-rec); }
.org-tag.scratch { background:var(--nv-tone-flow-bg); color:var(--nv-tone-flow); }
.org-dot { width:8px; height:8px; border-radius:50%; background:var(--nv-env-other); }
.org-dot.production { background:var(--nv-env-prod); }
.org-dot.sandbox { background:var(--nv-env-sandbox); }
.org-dot.scratch { background:var(--nv-env-scratch); }
.org-dot.developer { background:var(--nv-env-dev); }
.result.login-row { height:44px; }
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
    // /lightning/r/User/... route renders poorly), and record types, which have
    // no record page, on theirs in Object Manager (`of`: the record's object
    // the record type belongs to). Everything else uses the standard record view.
    function recordUrl(type, id, of) {
        if (type === "User") {
            return `/lightning/setup/ManageUsers/page?address=%2F${id}%3Fnoredirect%3D1`;
        }
        if (type === "RecordType" && of) {
            return `/lightning/setup/ObjectManager/${of}/RecordTypes/${id}/view`;
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
        APEX: "Apex",
        CMDT: "Custom Metadata Types",
        FIELD: "Fields",
        ORG: "Orgs",
        ACTION: "Actions",
        RELATED: "This record",
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
                pkg: SFEN_URL.namespaceOf(api), // installed package, ranked after the org's own
                url: `/lightning/o/${api}/home`,
                keywords: `${api} ${label || ""} list view records new create fields object manager schema`,
                actions: objectActions(api),
            },
        ];
    }

    // An object's → actions: its list view and a new record, then its pages
    // in Object Manager (shared with the popup's object menu).
    const OBJECT_PAGES = (typeof window !== "undefined" && window.SFEN_OBJECT_PAGES) || [];
    function objectActions(api) {
        const om = `/lightning/setup/ObjectManager/${api}`;
        return [
            { label: "Open list view", hint: "List", kind: "nav", url: `/lightning/o/${api}/home` },
            { label: "New record", hint: "New", kind: "nav", url: `/lightning/o/${api}/new?useRecordTypeCheck=1` },
            { label: "Fields & Relationships", hint: "Fields", kind: "nav", url: `${om}/FieldsAndRelationships/view` },
        ].concat(
            OBJECT_PAGES.map(([label, suffix]) => ({ label, hint: "Setup", kind: "nav", url: om + suffix })),
            [{ label: "Open in Object Manager", hint: "Setup", kind: "nav", url: `${om}/Details/view` }]
        );
    }

    // ---- Command verbs ---------------------------------------------------
    // Typed verbs (e.g. "new account") run a single action against an object.
    // "record" inspects the current record instead (handled in the palette);
    // its chip shows the live record's object name, not a generic label.
    const VERB_URL = {
        new: (api) => `/lightning/o/${api}/new?useRecordTypeCheck=1`,
        list: (api) => `/lightning/o/${api}/home`,
        fields: (api) => `/lightning/setup/ObjectManager/${api}/FieldsAndRelationships/view`,
        count: (api) => `/lightning/o/${api}/home`, // Enter counts instead (handled in the palette)
    };
    const VERB_HINT = { new: "New", list: "List", fields: "Fields", count: "Count" };
    const VERBS = {
        new: { kind: "object", action: "new", label: "New" },
        list: { kind: "object", action: "list", label: "List" },
        fields: { kind: "object", action: "fields", label: "Fields" },
        count: { kind: "object", action: "count", label: "Count" }, // records, by record type
        recent: { kind: "recent", label: "Recent" }, // your last viewed records, of one object or all
        app: { kind: "app", label: "App" }, // the user's Lightning apps
        apps: { kind: "app", label: "App" }, // alias of app
        org: { kind: "org", label: "Org" }, // saved orgs (quickOrgs)
        orgs: { kind: "org", label: "Org" }, // alias of org
        login: { kind: "login", label: "Log in as" }, // users from the "users" lookup
        limits: { kind: "limits", label: "Org Limits" }, // how much of each org limit is used
        // Setup items from the "admin" lookup, all of one kind; Enter opens one.
        flows: { kind: "admin", group: GROUPS.FLOW, label: "Flows" },
        flow: { kind: "admin", group: GROUPS.FLOW, label: "Flows" }, // alias of flows
        profiles: { kind: "admin", group: GROUPS.PROFILE, label: "Profiles" },
        profile: { kind: "admin", group: GROUPS.PROFILE, label: "Profiles" }, // alias of profiles
        permsets: { kind: "admin", group: GROUPS.PERMSET, label: "Permission Sets" },
        permset: { kind: "admin", group: GROUPS.PERMSET, label: "Permission Sets" }, // alias of permsets
        apex: { kind: "admin", group: GROUPS.APEX, label: "Apex" },
        users: { kind: "users", label: "Users" }, // users from the "users" lookup; Enter opens one
        user: { kind: "users", label: "Users" }, // alias of users
        record: { kind: "inspect", label: "Record" },
        json: { kind: "inspect", label: "Record" }, // alias of record
        api: { kind: "inspect", label: "Record" }, // alias of record
    };
    // Short forms, typed like the words: "f acc" is "fields acc". "lo" and
    // "li" because login and list both start with l, "re" because r is record.
    const VERB_SHORT = { f: "fields", lo: "login", li: "list", n: "new", a: "app", o: "org", r: "record", c: "count", re: "recent" };

    // The palette's commands, in the order and groups its board shows them:
    // what each does, an example, and its short form. Also listed on the
    // Settings page (Palette commands), which loads this file too.
    const COMMANDS = [
        { verb: "new", short: "n", group: "Objects", text: "Create a record of any object.", example: "new contact" },
        {
            verb: "list",
            short: "li",
            group: "Objects",
            text: "Open one of an object's list views.",
            example: "list account all",
            tip: "Add a number from 1 to 5, like list account 1, for an Account you viewed lately.",
        },
        {
            verb: "fields",
            short: "f",
            group: "Objects",
            text: "Find a field and open it in Object Manager.",
            example: "fields account industry",
            tip: "Press Tab to complete the object name.",
        },
        {
            verb: "count",
            short: "c",
            group: "Objects",
            text: "Count an object's records, by record type.",
            example: "count lead",
            tip: "Counts only the records you can see.",
        },
        {
            verb: "recent",
            short: "re",
            group: "Records",
            text: "The records you viewed last, of every object or one.",
            example: "recent account",
            tip: "Settings decide how many show: 10, 15 or 20.",
        },
        {
            verb: "record",
            short: "r",
            group: "Records",
            text: "Every field of the record you're on, with Copy JSON.",
            example: "record",
            tip: "Works on a record page. Type to filter the fields.",
        },
        {
            verb: "flows",
            group: "Setup",
            text: "Find a flow and open it in Flow Builder.",
            example: "flows lead",
            tip: "Opens the flow's latest version.",
        },
        { verb: "profiles", group: "Setup", text: "Find a profile and open it.", example: "profiles admin" },
        { verb: "permsets", group: "Setup", text: "Find a permission set and open it.", example: "permsets sales" },
        {
            verb: "users",
            group: "Setup",
            text: "Find a user and open their record.",
            example: "users jane",
            tip: "With nothing typed, it lists the 20 active users who logged in last. Press → to see a user's details.",
        },
        {
            verb: "apex",
            group: "Setup",
            text: "Find an Apex class or trigger and open it.",
            example: "apex selector",
            tip: "Package code is hidden; tick Show package code to list it.",
        },
        {
            verb: "limits",
            group: "Setup",
            text: "See how much of each org limit is used, most used first.",
            example: "limits api",
            tip: "Bars turn amber at 50% and red at 80%.",
        },
        { verb: "app", short: "a", group: "Go to", text: "Open one of your Lightning apps.", example: "app sales" },
        {
            verb: "org",
            short: "o",
            group: "Go to",
            text: "Open one of your saved orgs in a new tab.",
            example: "org uat",
            tip: "Press → to open the page you're on in that org.",
        },
        {
            verb: "login",
            short: "lo",
            group: "Go to",
            text: "Log in as another user, if you're allowed to.",
            example: "login jane",
            tip: "Ctrl+Enter (⌘+Enter on a Mac) logs in from an Incognito window.",
        },
    ];

    // A limit's API name as words: "DailyApiRequests" -> "Daily API Requests",
    // "DataStorageMB" -> "Data Storage MB".
    function limitLabel(name) {
        return String(name).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/\bApi\b/g, "API");
    }

    // Org limits with their used share, most used first; unused limits (and
    // any without a max) last, by name.
    function sortLimits(limits) {
        return limits
            .map((l) => {
                const used = Math.max(0, l.max - l.remaining);
                return { name: l.name, label: limitLabel(l.name), max: l.max, used, pct: l.max > 0 ? used / l.max : 0 };
            })
            .sort((a, b) => b.pct - a.pct || b.used - a.used || a.label.localeCompare(b.label));
    }

    // How well `q` names object `o`. The plural label counts too, so
    // "contacts" finds Contact rather than Contact Request.
    function objectScore(q, o) {
        return Math.max(
            SFEN_URL.matchScore(q, o.label || o.api, o.api),
            o.plural ? SFEN_URL.matchScore(q, o.plural, o.api) : -1
        );
    }

    // One result per object matching `arg`, navigating to the verb's destination.
    // boost: optional (url) => extra score, for results you pick often.
    function objectVerbEntries(action, objects, arg, boost) {
        const q = (arg || "").trim().toLowerCase();
        const scored = [];
        objects.forEach((o) => {
            const sc = q ? objectScore(q, o) : 0;
            if (sc < 0) return;
            const url = VERB_URL[action](o.api);
            scored.push({
                sc: sc - (SFEN_URL.namespaceOf(o.api) ? PACKAGE_PENALTY : 0) + (boost ? boost(url) : 0),
                item: {
                    label: o.label || o.api,
                    api: o.label && o.label !== o.api ? o.api : "",
                    hint: VERB_HINT[action],
                    group: GROUPS.OBJECT,
                    url,
                    keywords: `${o.api} ${o.label || ""}`,
                    objectApi: o.api, // the "fields" verb's Tab completes to this object
                },
            });
        });
        scored.sort((a, b) => b.sc - a.sc);
        return scored.map((s) => s.item);
    }

    // ---- Installed packages ----------------------------------------------
    // Objects and fields from installed packages stay searchable, but rank
    // after the org's own when they match about as well: scores come in bands
    // about 200 apart, so this only reorders within a band.
    const PACKAGE_PENALTY = 5;

    // The query to match an item with, or null to leave it out. Apex from an
    // installed package can't be read (Setup shows only its signature), so it
    // is left out unless the query names its package, as a word: "dlrs
    // selector" or "dlrs__selector". The rest of the query is then matched,
    // or the package name alone lists its classes.
    function packageQuery(item, q) {
        if (item.group !== GROUPS.APEX || !item.pkg) return q;
        const ns = item.pkg.toLowerCase();
        const words = q.split(/[^a-z0-9]+/).filter(Boolean);
        if (!words.includes(ns)) return null;
        return words.filter((w) => w !== ns).join(" ") || q;
    }

    // ---- Often picked ----------------------------------------------------
    // Results you pick often rank higher. The bonus grows with each pick but
    // stays well under the 100-200 points between match kinds (exact, prefix,
    // word start...), so it reorders similar matches only.
    function pickBonus(count) {
        return count > 0 ? Math.min(40, Math.round(12 * Math.log2(1 + count))) : 0;
    }

    // Pick counts, { [org]: { [url]: count } }, with one more pick of `url`
    // in `org`. Each org keeps its 200 most picked; the least picked other
    // url makes room for a new one.
    const PICKS_PER_ORG = 200;
    function addPick(picks, org, url) {
        const all = picks && typeof picks === "object" ? picks : {};
        const counts = { ...(all[org] || {}) };
        counts[url] = (counts[url] || 0) + 1;
        const entries = Object.entries(counts);
        if (entries.length > PICKS_PER_ORG) {
            const others = entries.filter(([u]) => u !== url).sort((a, b) => a[1] - b[1]);
            delete counts[others[0][0]];
        }
        return { ...all, [org]: counts };
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
    // A pasted token that looks like a record Id (see src/shared/sfUrl.js).
    const looksLikeRecordId = (s) => SFEN_URL.looksLikeRecordId(s);

    // ---- Pasted links ----------------------------------------------------
    // A pasted link to a page of an org (not Help, Trailhead, login or a
    // site), to open in the org of `host`: the same Setup page or list from
    // a sandbox, say. { path } to open, { path: null } for a page about one
    // record of another org (like SFEN_ORGS.samePageUrl), since that record
    // doesn't exist here, and null for anything else.
    function pastedLink(text, host) {
        let u;
        try {
            u = new URL(String(text).trim());
        } catch (e) {
            return null;
        }
        if (u.protocol !== "https:" || !SFEN_ORGS.myDomainHost(u.hostname)) return null;
        const path = u.pathname + u.search;
        if (path === "/" || !SFEN_URL.isSafePath(path)) return null;
        if (SFEN_ORGS.shortHost(u.hostname) === SFEN_ORGS.shortHost(host)) return { path };
        let plain = path;
        try {
            plain = decodeURIComponent(path);
        } catch (e) {
            /* keep it encoded */
        }
        return { path: plain.split(/[/?&=]/).some(SFEN_URL.looksLikeRecordId) ? null : path };
    }

    // ---- Icons -----------------------------------------------------------
    // Lucide-style 24px stroke shapes.
    const WRENCH = '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>';
    const ICONS = {
        [GROUPS.RECENT]: WRENCH,
        [GROUPS.BOOKMARK]: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
        [GROUPS.SETUP_TAB]: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/>',
        [GROUPS.RECORD]: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M7 13h6"/><path d="M7 16h10"/>',
        [GROUPS.OBJECT]: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
        [GROUPS.SETUP]: WRENCH,
        [GROUPS.FLOW]: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
        [GROUPS.PROFILE]: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        [GROUPS.PERMSET]: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
        [GROUPS.APP]: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
        [GROUPS.APEX]: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
        [GROUPS.CMDT]: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
        [GROUPS.ORG]: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
        [GROUPS.FIELD]: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
        [GROUPS.ACTION]: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    };
    // A result's tile color by its icon group (.icon.tone-* above); the rest are gray.
    const ICON_TONES = {
        [GROUPS.RECORD]: "rec",
        [GROUPS.RELATED]: "rec",
        [GROUPS.OBJECT]: "obj",
        [GROUPS.FIELD]: "obj",
        [GROUPS.SETUP_TAB]: "obj",
        [GROUPS.BOOKMARK]: "book",
        [GROUPS.FLOW]: "flow",
    };
    function svg(size, strokeWidth, body) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    }
    function iconSvg(group) {
        return svg(14, 2, ICONS[group] || ICONS[GROUPS.SETUP]);
    }
    const SEARCH_PATH = '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>';
    const UI_ICONS = {
        search: svg(18, 2, SEARCH_PATH),
        searchLarge: svg(26, 1.6, SEARCH_PATH),
        close: svg(12, 2.4, '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
        record: svg(18, 1.8, ICONS[GROUPS.RECORD]),
        newTab: svg(15, 2, '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
        copy: svg(15, 2, '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
        link: svg(15, 2, '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
        check: svg(15, 2.4, '<path d="M20 6 9 17l-5-5"/>'),
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
        ICON_TONES,
        UI_ICONS,
        VERBS,
        VERB_SHORT,
        COMMANDS,
        limitLabel,
        sortLimits,
        isRelevantObject,
        objectEntries,
        objectActions,
        objectScore,
        objectVerbEntries,
        PACKAGE_PENALTY,
        packageQuery,
        pickBonus,
        addPick,
        iconSvg,
        looksLikeRecordId,
        pastedLink,
        highlightPositions,
        escapeHtml,
        lightningOrigin,
        navigate,
        recordUrl,
    };
})();
