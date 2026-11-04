// Background service worker for Navigator for Salesforce
// Handles keyboard shortcuts and the command palette's org API calls

importScripts("/src/shared/sfUrl.js"); // self.SFEN_URL

// ---------------------------------------------------------------------------
// Command palette: live org access via the browser's Salesforce session.
// Reuses the "sid" session cookie (read with the cookies permission) as a
// Bearer token for REST/SOSL calls, mirroring how Salesforce Inspector works.
// ---------------------------------------------------------------------------
const SF_API_VERSION = "v60.0";

// Record search resolves a display name per matched object type (see the
// "search" action). Most objects expose Name; these standard ones use a
// different name field. SEARCH_NOISE mirrors OBJECT_NOISE in
// commandPalette.data.js to drop system/non-navigable objects from results.
const SEARCH_NAME_FIELDS = { Case: "CaseNumber", Order: "OrderNumber", Contract: "ContractNumber" };
const SEARCH_NOISE = /(ChangeEvent|__Share|__History|__Feed|__Tag|Share|History|Feed|__e|__mdt|__b|__x)$/;

// Map a Lightning/Setup host to the My Domain API host that owns the sid cookie.
function sfApiHost(host) {
    if (host.endsWith(".lightning.force.com")) {
        return host.replace(".lightning.force.com", ".my.salesforce.com");
    }
    if (host.endsWith(".my.salesforce-setup.com")) {
        return host.replace(".my.salesforce-setup.com", ".my.salesforce.com");
    }
    // Visualforce: the namespace is the last "--" segment.
    //   acme--c.vf.force.com              -> acme.my.salesforce.com
    //   acme--dev--c.sandbox.vf.force.com -> acme--dev.sandbox.my.salesforce.com
    const vf = host.match(/^(.+)--[^.]+(\.sandbox)?\.vf\.force\.com$/);
    if (vf) {
        return vf[1] + (vf[2] || "") + ".my.salesforce.com";
    }
    return host;
}

async function sfGetSession(host) {
    const apiHost = sfApiHost(host);
    for (const h of [apiHost, host]) {
        try {
            const cookie = await chrome.cookies.get({
                url: "https://" + h,
                name: "sid",
            });
            if (cookie && cookie.value) {
                return { token: cookie.value, apiHost };
            }
        } catch (e) {
            /* try next host */
        }
    }
    return null;
}

async function sfFetch(host, path, signal) {
    const session = await sfGetSession(host);
    if (!session) throw new Error("No Salesforce session found");
    const res = await fetch("https://" + session.apiHost + path, {
        signal,
        // Salesforce sends some responses (the object list) with a date but
        // no expiry, which Chrome would reuse for hours: a new object stayed
        // missing. Always check with Salesforce first.
        cache: "no-cache",
        headers: {
            Authorization: "Bearer " + session.token,
            Accept: "application/json",
        },
    });
    if (res.status === 401) throw new Error("Session expired — log in to Salesforce again");
    if (!res.ok) throw new Error("Salesforce API " + res.status);
    try {
        return await res.json();
    } catch (e) {
        throw new Error("Salesforce API " + res.status + ": response was not JSON");
    }
}

// SOQL query records, following nextRecordsUrl for up to maxPages pages.
async function sfQueryAll(host, soql, maxPages, signal) {
    let d = await sfFetch(host, `/services/data/${SF_API_VERSION}/query/?q=${encodeURIComponent(soql)}`, signal);
    let records = d.records || [];
    for (let page = 1; page < maxPages && SFEN_URL.isSafePath(d.nextRecordsUrl); page++) {
        d = await sfFetch(host, d.nextRecordsUrl, signal);
        records = records.concat(d.records || []);
    }
    return records;
}

function soslEscape(term) {
    return term.replace(/[?&|!{}[\]()^~*:\\"'+\-]/g, "\\$&");
}

// A term for inside a SOQL LIKE '%…%' literal: quote, backslash and wildcards.
function soqlLikeEscape(term) {
    return term.replace(/[\\'%_]/g, "\\$&");
}

// Users whose Name, Username or Alias contains `rawTerm`, active first, in the
// palette's record shape. Queried directly rather than via the global SOSL
// search, which keeps only its top 30 hits: a common name's Accounts,
// Contacts and Leads can push every User out. SOQL also has no index lag.
async function sfSearchUsers(host, rawTerm, limit, signal) {
    const like = `'%${soqlLikeEscape(rawTerm)}%'`;
    const rows = await sfQueryAll(
        host,
        "SELECT Id, Name, Username, IsActive, Profile.Name, Alias FROM User " +
            `WHERE Name LIKE ${like} OR Username LIKE ${like} OR Alias LIKE ${like} ` +
            `ORDER BY IsActive DESC, Name LIMIT ${limit}`,
        1,
        signal
    );
    return rows.map(userRow);
}

// The 20 active internal users who logged in last, for the "users" verb with
// nothing typed. Guest, portal and community users are left out.
async function sfActiveUsers(host) {
    const rows = await sfQueryAll(
        host,
        "SELECT Id, Name, Username, IsActive, Profile.Name, Alias FROM User " +
            "WHERE IsActive = true AND UserType = 'Standard' ORDER BY LastLoginDate DESC NULLS LAST, Name LIMIT 20",
        1
    );
    return rows.map(userRow);
}

function userRow(u) {
    return {
        Id: u.Id,
        attributes: { type: "User" },
        Name: u.Name,
        Username: u.Username,
        IsActive: u.IsActive,
        Alias: u.Alias,
        ProfileName: u.Profile ? u.Profile.Name : null,
    };
}

// A user's preview: the fields admins check first, most of which the User
// compact layout lacks. toLabel() gives the time zone's readable name.
async function sfUserPeek(host, id) {
    const [u] = await sfQueryAll(
        host,
        "SELECT Id, Name, Username, Email, IsActive, Alias, Title, Department, LastLoginDate, " +
            "toLabel(TimeZoneSidKey), Profile.Name, Profile.UserLicense.Name, UserRole.Name, ManagerId, Manager.Name " +
            `FROM User WHERE Id = '${id}'`,
        1
    );
    if (!u) throw new Error("Record not found");
    const name = (rel) => (rel && rel.Name) || "";
    const manager = RECORD_ID_RE.test(u.ManagerId || "") ? { id: u.ManagerId, type: "User", field: "ManagerId" } : null;
    const fields = [
        ["Username", u.Username],
        ["Email", u.Email],
        ["Status", u.IsActive ? "Active" : "Inactive"],
        ["Profile", name(u.Profile)],
        ["Role", name(u.UserRole)],
        ["User License", name(u.Profile && u.Profile.UserLicense)],
        ["Alias", u.Alias],
        ["Time Zone", u.TimeZoneSidKey],
        ["Last Login", u.LastLoginDate ? new Date(u.LastLoginDate).toLocaleString() : "Never"],
        ["Manager", name(u.Manager), manager],
        ["Title", u.Title],
        ["Department", u.Department],
        ["User Id", u.Id],
    ].map(([label, value, lookup]) => ({ label, value: value == null ? "" : String(value), lookup: lookup || null }));
    return { id: u.Id, type: "User", typeLabel: "User", name: String(u.Name || u.Id), fields };
}

// The newest "search" or "users" request per tab. Each one aborts the one
// before it, so fast typing doesn't stack up requests whose answers the
// palette would ignore anyway.
const searchAborts = {};
function newestSearch(sender, action) {
    const key = (sender.tab ? sender.tab.id : "") + " " + action;
    if (searchAborts[key]) searchAborts[key].abort();
    searchAborts[key] = new AbortController();
    return searchAborts[key].signal;
}

// userinfo (org id + current user id, needed for "Login as"), cached per API
// host + session token so a re-login or user switch never reuses stale data.
const userInfoCache = {};
async function sfGetUserInfo(host) {
    const session = await sfGetSession(host);
    if (!session) throw new Error("No Salesforce session found");
    const key = session.apiHost + " " + session.token;
    if (userInfoCache[key]) return userInfoCache[key];
    const info = await sfFetch(host, "/services/oauth2/userinfo");
    if (info) userInfoCache[key] = info;
    return info;
}

const USER_ID_RE = /^005[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/;
// Shapes checked before any value goes into a SOQL string or a REST path,
// including values that came back from Salesforce itself.
const RECORD_ID_RE = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;
const ORG_ID_RE = /^00D[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/;
const API_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const CUSTOM_OBJECT_ID_RE = /^01I[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/;
const KEY_PREFIX_RE = /^[A-Za-z0-9]{3}$/;
const FLOW_DEF_ID_RE = /^300[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/;
const FLOW_VERSION_ID_RE = /^301[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/;

// "Home" opens the current app's own landing page: the app the user last used
// on desktop (UserAppInfo) at /lightning/app/<id>, which Salesforce opens on
// the first page in that app's navigation. So apps without a Home tab (e.g.
// Agentforce Studio) don't get an extra Home tab. Any failure, live org access
// being off, or a slow org (2 s) falls back to the standard Home page.
const HOME_PATH = "/lightning/page/home";
async function appHomePath(host) {
    try {
        const { settings } = await chrome.storage.sync.get("settings");
        if (settings && settings.liveOrgAccess === false) return HOME_PATH;
        const lookup = (async () => {
            const info = await sfGetUserInfo(host);
            if (!info || !USER_ID_RE.test(info.user_id || "")) return HOME_PATH;
            const soql =
                "SELECT AppDefinitionId FROM UserAppInfo " +
                `WHERE UserId = '${info.user_id}' AND FormFactor = 'Large' LIMIT 1`;
            const d = await sfFetch(host, `/services/data/${SF_API_VERSION}/query/?q=${encodeURIComponent(soql)}`);
            // AppDefinitionId is the app's 06m… id that /lightning/app/ takes
            // (the AppDefinition relationship itself can come back null).
            const rec = d && d.records && d.records[0];
            const id = rec && rec.AppDefinitionId;
            return /^[A-Za-z0-9]{15,18}$/.test(id || "") ? `/lightning/app/${id}` : HOME_PATH;
        })();
        const timeout = new Promise((resolve) => setTimeout(() => resolve(HOME_PATH), 2000));
        return await Promise.race([lookup, timeout]);
    } catch (e) {
        return HOME_PATH;
    }
}
// One record as the user sees it on its record page, from the UI API's
// record-ui resource (record data, object metadata and the user's layout),
// reduced to plain strings: { id, type, typeLabel, name, items } with one item per layout field, in layout order. An item is
// { label, value, lookup }: value is what Salesforce displays (a lookup
// shows the related record's name) and lookup is { id, type } for a lookup
// that has a value. layoutType is "Compact" (the record's key fields) or
// "Full" (its page layout).
// UI API labels and display values are HTML-escaped; the palette shows text.
const HTML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'" };
function unescapeHtml(s) {
    return s.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (m, e) => HTML_ENTITIES[e]);
}

async function sfRecordUi(host, id, layoutType) {
    const d = await sfFetch(host, `/services/data/${SF_API_VERSION}/ui-api/record-ui/${id}?layoutTypes=${layoutType}&modes=View`);
    const rec = Object.values((d && d.records) || {})[0];
    if (!rec || !API_NAME_RE.test(rec.apiName || "") || !RECORD_ID_RE.test(rec.id || "")) throw new Error("Record not found");
    const info = (d.objectInfos || {})[rec.apiName] || {};
    const fieldInfo = info.fields || {};
    const fields = rec.fields || {};
    // A nested record (a relationship's value) has no text of its own.
    // Values and display values come HTML-escaped ("Grand Hotels &amp; Resorts").
    const text = (f) => {
        if (!f) return "";
        const v = f.displayValue != null ? f.displayValue : f.value;
        return v === null || v === undefined || typeof v === "object" ? "" : unescapeHtml(String(v)).slice(0, 300);
    };
    // layouts: object -> record type -> layout type -> mode -> layout.
    const layout = Object.values((d.layouts || {})[rec.apiName] || {})
        .map((byType) => byType && byType[layoutType] && byType[layoutType].View)
        .find(Boolean);
    const items = [];
    const seen = new Set();
    ((layout && layout.sections) || []).forEach((section) =>
        (section.layoutRows || []).forEach((row) =>
            (row.layoutItems || []).forEach((item) => {
                // An address is one item made of several fields.
                const comps = (item.layoutComponents || []).filter((c) => c && c.componentType === "Field" && typeof c.apiName === "string");
                if (!comps.length || seen.has(comps[0].apiName)) return;
                seen.add(comps[0].apiName);
                let value = comps.map((c) => text(fields[c.apiName])).filter(Boolean).join(", ");
                let lookup = null;
                // A custom lookup's item names "Id" here; the field itself holds the Id.
                const own = fieldInfo[comps[0].apiName];
                const idField = own && own.reference ? comps[0].apiName : item.lookupIdApiName;
                const idValue = idField && fields[idField] && fields[idField].value;
                if (typeof idValue === "string" && RECORD_ID_RE.test(idValue)) {
                    const fi = fieldInfo[idField] || {};
                    const rel = fields[fi.relationshipName];
                    const target = (rel && rel.value && rel.value.apiName) || (fi.referenceToInfos && fi.referenceToInfos[0] && fi.referenceToInfos[0].apiName);
                    value = text(rel) || value;
                    if (API_NAME_RE.test(target || "")) lookup = { id: idValue, type: target, field: idField };
                }
                items.push({ label: unescapeHtml(String(item.label || comps[0].apiName)), value, lookup });
            })
        )
    );
    const nameField = (info.nameFields || [])[0] || "Name";
    return {
        id: rec.id,
        type: rec.apiName,
        typeLabel: typeof info.label === "string" ? info.label : rec.apiName,
        name: text(fields[nameField]) || text(fields.Name) || rec.id,
        items,
    };
}

// Actions that read org data; all are gated by the liveOrgAccess setting.
const DATA_ACTIONS = new Set(["objects", "recent", "record", "search", "users", "admin", "describe", "context", "apps", "fields", "flowVersions", "peek", "hop", "listViews", "count", "limits"]);

// Why a palette message must be refused, or null when it's allowed.
function paletteDenied(msg, sender) {
    if (!sender || sender.id !== chrome.runtime.id) return "Unknown sender";
    if (msg.action === "orgs") {
        // Lists every org with a session: for the popup only, not for pages.
        return sender.tab ? "Not allowed from a page" : null;
    }
    // A bare host name only (no path, port or "@"), on a Salesforce domain.
    if (typeof msg.host !== "string" || !/^[a-z0-9.-]+$/i.test(msg.host) || !SFEN_URL.isSalesforceHost(msg.host)) {
        return "Not a Salesforce host";
    }
    if (sender.tab) {
        // Content scripts may only act on the org of the page they run in.
        let pageHost = "";
        try {
            pageHost = new URL(sender.tab.url).hostname;
        } catch (e) {
            /* no readable tab URL */
        }
        if (!pageHost || sfApiHost(pageHost) !== sfApiHost(String(msg.host))) {
            return "Host does not match the sending page";
        }
    }
    return null;
}

// The palette opened by its page key asks whether Chrome has a key for it
// (none means it only works while the page has focus), and its "Set it"
// button opens Chrome's shortcut page: only Chrome can set the key.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "paletteShortcut") return;
    if (!sender || sender.id !== chrome.runtime.id || !sender.tab) return;
    if (msg.open) {
        chrome.tabs.create({ url: "chrome://extensions/shortcuts", windowId: sender.tab.windowId, index: sender.tab.index + 1 });
        return;
    }
    chrome.commands.getAll((commands) => {
        const palette = (commands || []).find((c) => c.name === "open_command_palette");
        sendResponse({ ok: true, shortcut: (palette && palette.shortcut) || "" });
    });
    return true;
});

// Shift+Enter in the palette opens a result in a background tab, next to
// the page, and the palette stays open for the next one.
chrome.runtime.onMessage.addListener((msg, sender) => {
    if (!msg || msg.type !== "openTab") return;
    if (!sender || sender.id !== chrome.runtime.id || !sender.tab) return;
    if (typeof msg.url !== "string" || !SFEN_URL.isSalesforceUrl(msg.url)) return;
    chrome.tabs.create({ url: msg.url, active: false, windowId: sender.tab.windowId, index: sender.tab.index + 1 });
});

// The "N" button in the Salesforce header (headerButton.js) opens the popup.
// chrome.action.openPopup needs Chrome 127+.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "openPopup") return;
    if (!sender || sender.id !== chrome.runtime.id || !sender.tab) return;
    chrome.action
        .openPopup({ windowId: sender.tab.windowId })
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "palette") return;
    const denied = paletteDenied(msg, sender);
    if (denied) {
        sendResponse({ ok: false, error: denied });
        return;
    }
    (async () => {
        try {
            const host = msg.host;
            if (DATA_ACTIONS.has(msg.action)) {
                const { settings } = await chrome.storage.sync.get("settings");
                if (settings && settings.liveOrgAccess === false) {
                    throw new Error("Live org access is off");
                }
            }
            if (msg.action === "objects") {
                const data = await sfFetch(
                    host,
                    `/services/data/${SF_API_VERSION}/sobjects/`
                );
                sendResponse({ ok: true, sobjects: data.sobjects || [] });
            } else if (msg.action === "recent") {
                // Use a SOQL query on RecentlyViewed (same mechanism as the
                // context query, which works) instead of the REST /recent
                // resource, which can return empty in some orgs.
                // Exclude ListView (and null types) so every row resolves to a
                // real /lightning/r/{Type}/{Id}/view record link.
                // With an object (the palette's "recent account"), only its records.
                const object = msg.object;
                if (object !== undefined && (typeof object !== "string" || !/^[A-Za-z0-9_]+$/.test(object))) {
                    throw new Error("Invalid object name");
                }
                const soql =
                    "SELECT Id, Name, Type FROM RecentlyViewed " +
                    (object ? `WHERE Type = '${object}' ` : "WHERE Type != null AND Type != 'ListView' ") +
                    "ORDER BY LastViewedDate DESC NULLS LAST LIMIT 20";
                const data = await sfFetch(
                    host,
                    `/services/data/${SF_API_VERSION}/query/?q=${encodeURIComponent(soql)}`
                );
                const records = (data.records || []).map((r) => ({
                    Id: r.Id,
                    Name: r.Name,
                    attributes: { type: r.Type },
                }));
                sendResponse({ ok: true, records });
            } else if (msg.action === "record") {
                // Single record by type + Id (all fields) for the palette's
                // record inspector. Goes through sfFetch so the Bearer token is
                // attached — a raw browser request would 401.
                const type = msg.recordType;
                const id = msg.recordId;
                if (!API_NAME_RE.test(type || "") || !RECORD_ID_RE.test(id || "")) {
                    throw new Error("Invalid record type or Id");
                }
                const record = await sfFetch(
                    host,
                    `/services/data/${SF_API_VERSION}/sobjects/${encodeURIComponent(
                        type
                    )}/${encodeURIComponent(id)}`
                );
                sendResponse({ ok: true, record });
            } else if (msg.action === "describe") {
                // Field labels for the record inspector: [{ name, label }] only.
                const type = msg.recordType;
                if (!API_NAME_RE.test(type || "")) throw new Error("Invalid record type");
                const data = await sfFetch(
                    host,
                    `/services/data/${SF_API_VERSION}/sobjects/${encodeURIComponent(type)}/describe`
                );
                const fields = (data.fields || []).map((f) => ({ name: f.name, label: f.label }));
                sendResponse({ ok: true, fields });
            } else if (msg.action === "search") {
                // Length check on the raw term: escaping would make "?" look long enough.
                const rawTerm = (msg.term || "").trim();
                if (rawTerm.length < 2) {
                    sendResponse({ ok: true, records: [] });
                    return;
                }
                const term = soslEscape(rawTerm);
                const signal = newestSearch(sender, "search");
                // Phase 1 — a global SOSL with no RETURNING finds matching Ids +
                // types across ALL searchable objects (custom included). It comes
                // back with only Id + object type, so names are resolved below.
                const found = await sfFetch(
                    host,
                    `/services/data/${SF_API_VERSION}/search/?q=${encodeURIComponent(
                        `FIND {${term}*} IN NAME FIELDS`
                    )}`,
                    signal
                );
                // Drop system/non-navigable objects and Users (the palette gets
                // those from the "users" action), and cap, keeping relevance order.
                const hits = (found.searchRecords || [])
                    .filter(
                        (r) =>
                            r.attributes &&
                            API_NAME_RE.test(r.attributes.type || "") &&
                            RECORD_ID_RE.test(r.Id || "") &&
                            !SEARCH_NOISE.test(r.attributes.type) &&
                            r.attributes.type !== "User"
                    )
                    .slice(0, 30);
                if (!hits.length) {
                    sendResponse({ ok: true, records: [] });
                    return;
                }
                // Phase 2 — resolve a display name per matched type, in parallel.
                // Custom objects always expose Name; SEARCH_NAME_FIELDS covers the
                // standard exceptions. Only the 8 most relevant types are queried;
                // hits of other types are dropped.
                const idsByType = {};
                hits.forEach((r) => {
                    const t = r.attributes.type;
                    if (!idsByType[t] && Object.keys(idsByType).length >= 8) return;
                    (idsByType[t] = idsByType[t] || []).push(r.Id);
                });
                const runQuery = async (soql) => {
                    try {
                        const d = await sfFetch(
                            host,
                            `/services/data/${SF_API_VERSION}/query/?q=${encodeURIComponent(soql)}`,
                            signal
                        );
                        return d.records || [];
                    } catch (e) {
                        return null; // assumed field may not exist on this object
                    }
                };
                const byId = {};
                await Promise.all(
                    Object.keys(idsByType).map(async (type) => {
                        const inList = idsByType[type].map((id) => `'${id}'`).join(",");
                        const nameField = SEARCH_NAME_FIELDS[type] || "Name";
                        let rows = await runQuery(
                            `SELECT Id, ${nameField} FROM ${type} WHERE Id IN (${inList})`
                        );
                        if (rows === null) {
                            // No such name field — fall back to Id-only (displays the Id).
                            rows = await runQuery(`SELECT Id FROM ${type} WHERE Id IN (${inList})`);
                        }
                        (rows || []).forEach((row) => {
                            byId[row.Id] = { [nameField]: row[nameField] };
                        });
                    })
                );
                // Rebuild in the original relevance order, attaching resolved names.
                const records = hits.filter((r) => idsByType[r.attributes.type]).map((r) => ({
                    Id: r.Id,
                    attributes: { type: r.attributes.type },
                    ...(byId[r.Id] || {}),
                }));
                sendResponse({ ok: true, records });
            } else if (msg.action === "users") {
                // Users for the "login" verb, or the 5 that plain search lists
                // first. Plain search asks for them apart from "search", so a
                // slow User query (an org with many users) doesn't hold up records.
                const rawTerm = (msg.term || "").trim();
                if (rawTerm.length < 2) {
                    // The "users" verb with nothing typed asks for active users.
                    sendResponse({ ok: true, records: msg.active === true && !rawTerm ? await sfActiveUsers(host) : [] });
                    return;
                }
                const limit = msg.limit === 5 ? 5 : 20;
                sendResponse({ ok: true, records: await sfSearchUsers(host, rawTerm, limit, newestSearch(sender, "users")) });
            } else if (msg.action === "appHome") {
                sendResponse({ ok: true, path: await appHomePath(host) });
            } else if (msg.action === "context") {
                const data = await sfFetch(
                    host,
                    `/services/data/${SF_API_VERSION}/query/?q=${encodeURIComponent(
                        "SELECT Name, IsSandbox, InstanceName, OrganizationType FROM Organization LIMIT 1"
                    )}`
                );
                let user = null;
                try {
                    user = await sfFetch(host, "/services/oauth2/userinfo");
                } catch (e) {
                    /* userinfo optional */
                }
                sendResponse({
                    ok: true,
                    org: (data.records || [])[0] || null,
                    user,
                });
            } else if (msg.action === "admin") {
                // Searchable admin metadata: profiles, permission sets, flows,
                // Apex classes and triggers, custom metadata types. Fetched in
                // the palette's background, newest first, and fuzzy-filtered
                // client-side; the palette refetches it after 10 minutes.
                // pages: batches of up to 2,000 to follow; a batch that fails
                // keeps the ones before it.
                const q = async (soql, pages = 1) => {
                    let records = [];
                    try {
                        let d = await sfFetch(host, `/services/data/${SF_API_VERSION}/query/?q=${encodeURIComponent(soql)}`);
                        records = d.records || [];
                        for (let p = 1; p < pages && SFEN_URL.isSafePath(d.nextRecordsUrl); p++) {
                            d = await sfFetch(host, d.nextRecordsUrl);
                            records = records.concat(d.records || []);
                        }
                    } catch (e) {
                        /* a feature may be unavailable; keep what loaded */
                    }
                    return records;
                };
                const [profiles, permissionSets, flows, classes, triggers, entities] = await Promise.all([
                    q("SELECT Id, Name FROM Profile ORDER BY LastModifiedDate DESC LIMIT 10000", 5),
                    q(
                        "SELECT Id, Name, Label, Type FROM PermissionSet " +
                        "WHERE IsOwnedByProfile = false ORDER BY LastModifiedDate DESC LIMIT 10000",
                        5
                    ),
                    q(
                        // ActiveVersionId / LatestVersionId are the 301 flow-version
                        // ids Flow Builder opens; DurableId is the 300 definition id
                        // (passing it to flowBuilder.app yields "We can't open this flow").
                        // Packaged flows have no LastModifiedDate; NULLS LAST keeps
                        // the org's own recent flows first.
                        "SELECT DurableId, ApiName, Label, ProcessType, IsActive, " +
                        "ActiveVersionId, LatestVersionId " +
                        "FROM FlowDefinitionView ORDER BY LastModifiedDate DESC NULLS LAST LIMIT 10000",
                        5
                    ),
                    // The org's own code first, then managed packages'.
                    q("SELECT Id, Name, NamespacePrefix FROM ApexClass ORDER BY NamespacePrefix NULLS FIRST, LastModifiedDate DESC LIMIT 10000", 5),
                    q(
                        "SELECT Id, Name, NamespacePrefix, TableEnumOrId FROM ApexTrigger " +
                        "ORDER BY NamespacePrefix NULLS FIRST, LastModifiedDate DESC LIMIT 10000",
                        5
                    ),
                    // EntityDefinition ignores LIMIT and can't page; custom
                    // metadata types fit in one batch. DurableId is the type's
                    // 01I id that its Setup page takes.
                    q(
                        "SELECT DurableId, QualifiedApiName, Label, NamespacePrefix, KeyPrefix " +
                        "FROM EntityDefinition WHERE QualifiedApiName LIKE '%__mdt'"
                    ),
                ]);
                // Only the fields the palette uses, with Ids checked: they go into Setup URLs.
                const ns = (r) => (typeof r.NamespacePrefix === "string" && API_NAME_RE.test(r.NamespacePrefix) ? r.NamespacePrefix : null);
                const apexClasses = classes
                    .filter((c) => RECORD_ID_RE.test(c.Id || "") && typeof c.Name === "string")
                    .map((c) => ({ Id: c.Id, Name: c.Name, NamespacePrefix: ns(c) }));
                // A trigger's TableEnumOrId is the object's API name, or for a
                // custom object its 01I Id, which is that object's EntityDefinition
                // DurableId: look those names up, 100 Ids to a query. Ids are
                // compared on their first 15 characters (either length can come back).
                const tableOf = (t) => (typeof t.TableEnumOrId === "string" ? t.TableEnumOrId : "");
                const objectIds = [...new Set(triggers.map(tableOf).filter((v) => CUSTOM_OBJECT_ID_RE.test(v)))];
                const batches = [];
                for (let i = 0; i < objectIds.length; i += 100) batches.push(objectIds.slice(i, i + 100));
                const named = await Promise.all(
                    batches.map((ids) => {
                        const list = [...new Set(ids.flatMap((id) => [id, id.slice(0, 15)]))].map((id) => `'${id}'`).join(",");
                        return q(`SELECT DurableId, QualifiedApiName FROM EntityDefinition WHERE DurableId IN (${list})`);
                    })
                );
                const objectNames = {};
                named.flat().forEach((e) => {
                    if (CUSTOM_OBJECT_ID_RE.test(e.DurableId || "") && API_NAME_RE.test(e.QualifiedApiName || ""))
                        objectNames[e.DurableId.slice(0, 15)] = e.QualifiedApiName;
                });
                const apexTriggers = triggers
                    .filter((t) => RECORD_ID_RE.test(t.Id || "") && typeof t.Name === "string")
                    .map((t) => {
                        const table = tableOf(t);
                        return {
                            Id: t.Id,
                            Name: t.Name,
                            NamespacePrefix: ns(t),
                            // Not RECORD_ID_RE: standard names like ServiceAppointment
                            // are 15 or 18 letters too.
                            Object: CUSTOM_OBJECT_ID_RE.test(table) ? objectNames[table.slice(0, 15)] || null : API_NAME_RE.test(table) ? table : null,
                        };
                    });
                // LIKE's "_" matches any character, so check the suffix again.
                const metadataTypes = entities
                    .filter((e) => CUSTOM_OBJECT_ID_RE.test(e.DurableId || "") && /__mdt$/.test(e.QualifiedApiName || ""))
                    .map((e) => ({
                        Id: e.DurableId,
                        ApiName: e.QualifiedApiName,
                        Label: typeof e.Label === "string" ? e.Label : e.QualifiedApiName,
                        KeyPrefix: KEY_PREFIX_RE.test(e.KeyPrefix || "") ? e.KeyPrefix : null,
                    }))
                    .sort((a, b) => a.Label.localeCompare(b.Label));
                sendResponse({ ok: true, profiles, permissionSets, flows, apexClasses, apexTriggers, metadataTypes });
            } else if (msg.action === "apps") {
                // The user's Lightning apps in App Launcher order. UserAppMenuItem
                // is the user's visible app list; AppDefinition (every app in the
                // org) supplies the 06m… id that /lightning/app/ opens. Name is the
                // app's DeveloperName, with or without its namespace prefix.
                const [defs, items] = await Promise.all([
                    sfQueryAll(
                        host,
                        "SELECT DurableId, DeveloperName, NamespacePrefix, Label, NavType " +
                        "FROM AppDefinition WHERE UiType = 'Lightning'",
                        5
                    ),
                    sfQueryAll(
                        host,
                        "SELECT Name, Label, SortOrder, UserSortOrder FROM UserAppMenuItem " +
                        "WHERE IsVisible = true AND Type = 'TabSet'",
                        5
                    ),
                ]);
                const byName = {};
                defs.forEach((d) => {
                    byName[d.NamespacePrefix ? d.NamespacePrefix + "__" + d.DeveloperName : d.DeveloperName] = d;
                });
                defs.forEach((d) => {
                    if (!byName[d.DeveloperName]) byName[d.DeveloperName] = d;
                });
                const order = (i) => (i.UserSortOrder != null ? i.UserSortOrder : i.SortOrder);
                const apps = [];
                items.sort((a, b) => order(a) - order(b)).forEach((i) => {
                    const d = byName[i.Name];
                    if (!d || !/^[A-Za-z0-9]{15,18}$/.test(d.DurableId || "")) return;
                    apps.push({ id: d.DurableId, label: i.Label || d.Label, console: d.NavType === "Console" });
                });
                sendResponse({ ok: true, apps });
            } else if (msg.action === "flowVersions") {
                // Recent Setup keeps a flow's definition id (300…) next to the
                // version link it opened. Map each to the flow's current version
                // (latest first, like the palette's search) so a link saved
                // before a newer version was saved doesn't open the old one.
                const ids = msg.flowIds;
                if (
                    !Array.isArray(ids) ||
                    !ids.length ||
                    ids.length > 10 ||
                    !ids.every((id) => typeof id === "string" && FLOW_DEF_ID_RE.test(id))
                ) {
                    throw new Error("Invalid flow ids");
                }
                const rows = await sfQueryAll(
                    host,
                    "SELECT DurableId, LatestVersionId, ActiveVersionId FROM FlowDefinitionView " +
                    `WHERE DurableId IN ('${ids.join("','")}')`,
                    1
                );
                const versions = {};
                rows.forEach((r) => {
                    const v = r.LatestVersionId || r.ActiveVersionId;
                    if (FLOW_DEF_ID_RE.test(r.DurableId || "") && FLOW_VERSION_ID_RE.test(v || "")) versions[r.DurableId] = v;
                });
                sendResponse({ ok: true, versions });
            } else if (msg.action === "fields") {
                // One object's fields for the palette's "fields" verb (FieldDefinition
                // requires an object filter). key is what the field's Setup page URL
                // takes: DurableId is "Account.Industry" for standard fields and
                // "Account.00N…" for custom ones.
                const object = msg.object;
                if (typeof object !== "string" || !/^[A-Za-z0-9_]+$/.test(object)) {
                    throw new Error("Invalid object name");
                }
                const rows = await sfQueryAll(
                    host,
                    "SELECT QualifiedApiName, Label, DurableId, DataType FROM FieldDefinition " +
                    `WHERE EntityDefinition.QualifiedApiName = '${object}'`,
                    5
                );
                const fields = rows.map((f) => {
                    const id = String(f.DurableId || "");
                    return { api: f.QualifiedApiName, label: f.Label, type: f.DataType, key: id.slice(id.indexOf(".") + 1) };
                });
                sendResponse({ ok: true, fields });
            } else if (msg.action === "listViews") {
                // One object's list views for the palette's "list" verb, and the
                // user's last 5 viewed records of it ("list account 2").
                const object = msg.object;
                if (typeof object !== "string" || !/^[A-Za-z0-9_]+$/.test(object)) {
                    throw new Error("Invalid object name");
                }
                const recentSoql =
                    `SELECT Id, Name FROM RecentlyViewed WHERE Type = '${object}' ` +
                    "ORDER BY LastViewedDate DESC NULLS LAST LIMIT 5";
                const [rows, recent] = await Promise.all([
                    sfQueryAll(host, `SELECT Id, Name, DeveloperName FROM ListView WHERE SobjectType = '${object}'`, 5),
                    // Some objects aren't tracked in RecentlyViewed; list views still load.
                    sfFetch(host, `/services/data/${SF_API_VERSION}/query/?q=${encodeURIComponent(recentSoql)}`).catch(() => ({})),
                ]);
                const listViews = rows
                    .filter((v) => RECORD_ID_RE.test(v.Id || "") && typeof v.Name === "string")
                    .map((v) => ({ id: v.Id, label: v.Name, api: v.DeveloperName }));
                const records = (recent.records || [])
                    .filter((r) => RECORD_ID_RE.test(r.Id || ""))
                    .map((r) => ({ id: r.Id, name: r.Name || r.Id }));
                sendResponse({ ok: true, listViews, records });
            } else if (msg.action === "count") {
                // One object's record count for the palette's "count" verb, and
                // each record type's. RecordTypeId only exists once the object
                // has a record type; records without one are Master.
                const object = msg.object;
                if (typeof object !== "string" || !/^[A-Za-z0-9_]+$/.test(object)) {
                    throw new Error("Invalid object name");
                }
                const types = await sfQueryAll(host, `SELECT Id, Name, IsActive FROM RecordType WHERE SobjectType = '${object}'`, 1);
                if (!types.length) {
                    const res = await sfFetch(host, `/services/data/${SF_API_VERSION}/query/?q=${encodeURIComponent(`SELECT COUNT() FROM ${object}`)}`);
                    sendResponse({ ok: true, total: res.totalSize || 0, recordTypes: [] });
                } else {
                    const groups = await sfQueryAll(host, `SELECT RecordTypeId, COUNT(Id) n FROM ${object} GROUP BY RecordTypeId`, 1);
                    const counts = {};
                    let total = 0;
                    groups.forEach((g) => {
                        const n = Number(g.n) || 0;
                        const id = types.some((t) => t.Id === g.RecordTypeId) ? g.RecordTypeId : "master";
                        counts[id] = (counts[id] || 0) + n;
                        total += n;
                    });
                    // Inactive record types only while records still use them.
                    const recordTypes = types
                        .filter((t) => t.IsActive || counts[t.Id])
                        .map((t) => ({ name: String(t.Name || t.Id), count: counts[t.Id] || 0, active: !!t.IsActive }));
                    recordTypes.push({ name: "Master", count: counts.master || 0, active: true });
                    sendResponse({ ok: true, total, recordTypes });
                }
            } else if (msg.action === "limits") {
                // The org's limits for the palette's Org Limits view. Each
                // connected app's share of a limit is left out.
                const data = (await sfFetch(host, `/services/data/${SF_API_VERSION}/limits/`)) || {};
                const limits = Object.keys(data)
                    .filter((k) => /^[A-Za-z0-9_]+$/.test(k) && data[k] && Number.isFinite(data[k].Max) && Number.isFinite(data[k].Remaining))
                    .map((k) => ({ name: k, max: data[k].Max, remaining: data[k].Remaining }));
                sendResponse({ ok: true, limits });
            } else if (msg.action === "peek" && USER_ID_RE.test(msg.recordId || "")) {
                sendResponse({ ok: true, record: await sfUserPeek(host, msg.recordId) });
            } else if (msg.action === "peek") {
                // The palette's preview of a record: its compact layout, the
                // key fields Salesforce shows at the top of its page.
                const id = msg.recordId;
                if (!RECORD_ID_RE.test(id || "")) throw new Error("Invalid record Id");
                const rec = await sfRecordUi(host, id, "Compact");
                const nameLabel = (it) => it.value === rec.name && !it.lookup;
                sendResponse({
                    ok: true,
                    record: { id: rec.id, type: rec.type, typeLabel: rec.typeLabel, name: rec.name, fields: rec.items.filter((it) => !nameLabel(it)).slice(0, 10) },
                });
            } else if (msg.action === "hop") {
                // Where the palette can go from the record you're on: the
                // records its page layout links to (lookups).
                const id = msg.recordId;
                if (!RECORD_ID_RE.test(id || "")) throw new Error("Invalid record Id");
                const rec = await sfRecordUi(host, id, "Full");
                // Created By and Last Modified By are on every layout: noise here.
                const seen = new Set();
                const lookups = rec.items
                    .filter((it) => it.lookup && !["CreatedById", "LastModifiedById"].includes(it.lookup.field))
                    .filter((it) => !seen.has(it.label + it.lookup.id) && seen.add(it.label + it.lookup.id))
                    .map((it) => ({ label: it.label, name: it.value || it.lookup.id, id: it.lookup.id, type: it.lookup.type }));
                sendResponse({ ok: true, id: rec.id, type: rec.type, typeLabel: rec.typeLabel, name: rec.name, lookups });
            } else if (msg.action === "loginAs") {
                const userId = msg.userId;
                if (typeof userId !== "string" || !USER_ID_RE.test(userId)) {
                    throw new Error("Invalid user Id");
                }
                const session = await sfGetSession(host);
                if (!session) throw new Error("No Salesforce session found");
                const info = await sfGetUserInfo(host);
                const orgId = info && info.organization_id;
                if (!ORG_ID_RE.test(orgId || "")) throw new Error("Could not determine org Id");
                // Land on the page the user is currently viewing (e.g. an
                // Opportunity list view), falling back to Home.
                const targetUrl = SFEN_URL.isSafePath(msg.targetPath)
                    ? msg.targetPath
                    : "/home/home.jsp";
                // Salesforce rejects "log in as yourself"; just open the page as you.
                const isSelf = info.user_id && info.user_id === userId;
                const uid = encodeURIComponent(userId);
                const suUrl = isSelf
                    ? targetUrl
                    : `/servlet/servlet.su?oid=${orgId}&suorgadminid=${uid}` +
                      `&retURL=${encodeURIComponent("/" + uid + "?noredirect=1")}` +
                      `&isUserEntityOverride=1&targetURL=${encodeURIComponent(targetUrl)}`;
                if (msg.incognito) {
                    // Incognito has no Salesforce session, so bridge the admin
                    // session in via frontdoor.jsp, then chain to servlet.su.
                    // The sid goes in the URL by design: frontdoor.jsp is the
                    // only way to carry the session into incognito.
                    const full =
                        "https://" + session.apiHost + "/secur/frontdoor.jsp?sid=" +
                        encodeURIComponent(session.token) +
                        "&retURL=" + encodeURIComponent(suUrl);
                    try {
                        await chrome.windows.create({ incognito: true, url: full });
                        sendResponse({ ok: true });
                    } catch (e) {
                        sendResponse({
                            ok: false,
                            error:
                                "Allow this extension in incognito first " +
                                "(chrome://extensions → Details → Allow in incognito).",
                        });
                    }
                } else {
                    await chrome.tabs.create({
                        url: "https://" + session.apiHost + suUrl,
                    });
                    sendResponse({ ok: true });
                }
            } else if (msg.action === "orgs") {
                // Discover every org the browser currently has a session for.
                const cookies = await chrome.cookies.getAll({ name: "sid" });
                const seen = new Set();
                const orgs = [];
                for (const c of cookies) {
                    // Skip expired sessions (session cookies have no expirationDate).
                    if (c.expirationDate && c.expirationDate * 1000 < Date.now()) continue;
                    const domain = c.domain.replace(/^\./, "");
                    if (!/\.my\.salesforce\.com$/.test(domain)) continue;
                    if (seen.has(domain)) continue;
                    seen.add(domain);
                    const sub = domain.replace(/\.my\.salesforce\.com$/, "");
                    orgs.push({
                        apiHost: domain,
                        lightningHost: domain.replace(
                            /\.my\.salesforce\.com$/,
                            ".lightning.force.com"
                        ),
                        label: sub,
                        isSandbox: /\.sandbox$/.test(sub) || sub.includes("--"),
                    });
                }
                sendResponse({ ok: true, orgs });
            } else {
                sendResponse({ ok: false, error: "Unknown action" });
            }
        } catch (e) {
            sendResponse({ ok: false, error: String((e && e.message) || e) });
        }
    })();
    return true; // keep the message channel open for the async response
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
    switch (command) {
        case 'navigate_to_setup':
            navigateActive('/lightning/setup/SetupOneHome/home');
            break;
        case 'navigate_to_home':
            navigateActive(appHomePath);
            break;
        case 'open_command_palette':
            // The browser captures Alt+K before the page, so this works even when
            // focus is in an embedded iframe. Relay it to the active tab's palette.
            chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
                if (tab)
                    chrome.tabs.sendMessage(
                        tab.id,
                        { type: 'sfen-toggle-palette' },
                        () => void chrome.runtime.lastError // ignore tabs w/o the content script
                    );
            });
            break;
    }
});

// Navigate the active Salesforce tab to a path on its own org.
// `path` is a string, or a function (host) => Promise<path> (see appHomePath).
async function navigateActive(path) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !SFEN_URL.isSalesforceUrl(tab.url)) return;
        const url = new URL(tab.url);
        const target = typeof path === "function" ? await path(url.hostname) : path;
        await chrome.tabs.update(tab.id, { url: url.origin + target });
    } catch (error) {
        console.error('Error navigating:', error);
    }
}

// On first install, Chrome leaves a suggested shortcut unset when it clashes
// with another extension; send the user to Settings to pick one.
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== 'install') return;
    chrome.commands.getAll((commands) => {
        if (commands.some((c) => !c.shortcut)) {
            chrome.tabs.create({ url: chrome.runtime.getURL('settings.html#shortcuts') });
        }
    });
});

// Error handling for the service worker
self.addEventListener('error', (event) => {
    console.error('Service worker error:', event.error);
});

// Handle unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
}); 