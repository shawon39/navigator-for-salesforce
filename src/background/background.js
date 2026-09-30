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

async function sfFetch(host, path) {
    const session = await sfGetSession(host);
    if (!session) throw new Error("No Salesforce session found");
    const res = await fetch("https://" + session.apiHost + path, {
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
async function sfQueryAll(host, soql, maxPages) {
    let d = await sfFetch(host, `/services/data/${SF_API_VERSION}/query/?q=${encodeURIComponent(soql)}`);
    let records = d.records || [];
    for (let page = 1; page < maxPages && SFEN_URL.isSafePath(d.nextRecordsUrl); page++) {
        d = await sfFetch(host, d.nextRecordsUrl);
        records = records.concat(d.records || []);
    }
    return records;
}

function soslEscape(term) {
    return term.replace(/[?&|!{}[\]()^~*:\\"'+\-]/g, "\\$&");
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
// Actions that read org data; all are gated by the liveOrgAccess setting.
const DATA_ACTIONS = new Set(["objects", "recent", "record", "search", "admin", "describe", "context", "apps", "fields"]);

// Why a palette message must be refused, or null when it's allowed.
function paletteDenied(msg, sender) {
    if (!sender || sender.id !== chrome.runtime.id) return "Unknown sender";
    if (msg.action !== "orgs" && !SFEN_URL.isSalesforceHost(msg.host)) {
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
                const soql =
                    "SELECT Id, Name, Type FROM RecentlyViewed " +
                    "WHERE Type != null AND Type != 'ListView' " +
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
                if (!type || !id) throw new Error("Missing record type or Id");
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
                if (!type) throw new Error("Missing record type");
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
                // Phase 1 — a global SOSL with no RETURNING finds matching Ids +
                // types across ALL searchable objects (custom included). It comes
                // back with only Id + object type, so names are resolved below.
                const found = await sfFetch(
                    host,
                    `/services/data/${SF_API_VERSION}/search/?q=${encodeURIComponent(
                        `FIND {${term}*} IN NAME FIELDS`
                    )}`
                );
                // Drop system/non-navigable objects and cap, keeping relevance order.
                const hits = (found.searchRecords || [])
                    .filter(
                        (r) =>
                            r.attributes &&
                            r.attributes.type &&
                            !SEARCH_NOISE.test(r.attributes.type)
                    )
                    .slice(0, 30);
                if (!hits.length) {
                    sendResponse({ ok: true, records: [] });
                    return;
                }
                // Phase 2 — resolve a display name per matched type, in parallel.
                // Custom objects always expose Name; SEARCH_NAME_FIELDS covers the
                // standard exceptions. Users keep the richer query so the palette's
                // "Login as" / profile sub-line stays populated. Only the 8 most
                // relevant types are queried; hits of other types are dropped.
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
                            `/services/data/${SF_API_VERSION}/query/?q=${encodeURIComponent(soql)}`
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
                        if (type === "User") {
                            const rows = await runQuery(
                                "SELECT Id, Name, Username, IsActive, Profile.Name, Alias " +
                                `FROM User WHERE Id IN (${inList})`
                            );
                            (rows || []).forEach((u) => {
                                byId[u.Id] = {
                                    Name: u.Name,
                                    Username: u.Username,
                                    IsActive: u.IsActive,
                                    Alias: u.Alias,
                                    ProfileName: u.Profile ? u.Profile.Name : null,
                                };
                            });
                            return;
                        }
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
                // Searchable admin metadata: profiles, permission sets, flows.
                // Fetched once per palette session and fuzzy-filtered client-side.
                const q = async (soql) => {
                    try {
                        const d = await sfFetch(
                            host,
                            `/services/data/${SF_API_VERSION}/query/?q=${encodeURIComponent(soql)}`
                        );
                        return d.records || [];
                    } catch (e) {
                        return []; // a feature may be unavailable; degrade gracefully
                    }
                };
                const [profiles, permissionSets, flows] = await Promise.all([
                    q("SELECT Id, Name FROM Profile ORDER BY Name LIMIT 1000"),
                    q(
                        "SELECT Id, Name, Label, Type FROM PermissionSet " +
                        "WHERE IsOwnedByProfile = false ORDER BY Label LIMIT 1000"
                    ),
                    q(
                        // ActiveVersionId / LatestVersionId are the 301 flow-version
                        // ids Flow Builder opens; DurableId is the 300 definition id
                        // (passing it to flowBuilder.app yields "We can't open this flow").
                        "SELECT DurableId, ApiName, Label, ProcessType, IsActive, " +
                        "ActiveVersionId, LatestVersionId " +
                        "FROM FlowDefinitionView ORDER BY Label LIMIT 2000"
                    ),
                ]);
                sendResponse({ ok: true, profiles, permissionSets, flows });
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
            } else if (msg.action === "loginAs") {
                const userId = msg.userId;
                if (typeof userId !== "string" || !USER_ID_RE.test(userId)) {
                    throw new Error("Invalid user Id");
                }
                const session = await sfGetSession(host);
                if (!session) throw new Error("No Salesforce session found");
                const info = await sfGetUserInfo(host);
                const orgId = info && info.organization_id;
                if (!orgId) throw new Error("Could not determine org Id");
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