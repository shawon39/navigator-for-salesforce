// Background worker: the "apps" (App Launcher list) and "fields" (per-object
// FieldDefinition) actions, including validation, paging and live-access gating.
// "apps" and "fields" palette actions, with a stubbed fetch.
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const ROOT = require("path").resolve(__dirname, "..");

let fetchCalls = [], storage = {}, route = () => null;
let listener;
const json = (d) => ({ ok: true, status: 200, json: async () => d });
const ctx = {
    console, URL, Set, Promise, Date, encodeURIComponent,
    fetch: async (url) => {
        fetchCalls.push(url);
        const r = route(url);
        return r || json({ records: [] });
    },
    importScripts: (p) => vm.runInContext(fs.readFileSync(ROOT + p, "utf8"), ctx),
    addEventListener() {},
    chrome: {
        runtime: { id: "EXT", onMessage: { addListener: (f) => (listener = f) }, onInstalled: { addListener() {} }, getURL: (p) => p },
        cookies: { get: async ({ url }) => ({ value: "TOKEN-" + url }), getAll: async () => [] },
        storage: { sync: { get: async () => storage } },
        tabs: { create: async () => {}, query: async () => [], update: async () => {} },
        windows: { create: async () => {} },
        commands: { onCommand: { addListener() {} }, getAll: (cb) => cb([]) },
    },
};
ctx.self = ctx; ctx.setTimeout = setTimeout;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + "/src/background/background.js", "utf8"), ctx);

const T = { id: "EXT", tab: { url: "https://acme.lightning.force.com/lightning/page/home" } };
const send = (msg) => new Promise((resolve) => listener({ type: "palette", host: "acme.my.salesforce.com", ...msg }, T, (x) => resolve(JSON.parse(JSON.stringify(x)))));
const soql = (url) => decodeURIComponent((url.split("?q=")[1] || "").replace(/\+/g, " "));

(async () => {
    let r;
    // ---- apps ----
    const defsPage1 = { records: [
        { DurableId: "06m000000000001AAA", DeveloperName: "LightningSales", NamespacePrefix: null, Label: "Sales", NavType: "Standard" },
        { DurableId: "06m000000000002AAA", DeveloperName: "LightningSalesConsole", NamespacePrefix: null, Label: "Sales Console", NavType: "Console" },
        { DurableId: "06m000000000003AAA", DeveloperName: "Hidden_App", NamespacePrefix: null, Label: "Hidden", NavType: "Standard" },
    ], nextRecordsUrl: "/services/data/v60.0/query/01gDEFS-2000" };
    const defsPage2 = { records: [
        { DurableId: "06m000000000004AAA", DeveloperName: "Finances", NamespacePrefix: "acme", Label: "Finances", NavType: "Standard" },
        { DurableId: "06m000000000005AAA", DeveloperName: "HR", NamespacePrefix: "hrns", Label: "Human Resources", NavType: "Console" },
        { DurableId: "../evil", DeveloperName: "Bad", NamespacePrefix: null, Label: "Bad", NavType: "Standard" },
    ] };
    const menu = { records: [
        { Name: "LightningSalesConsole", Label: "Sales Console", SortOrder: 2, UserSortOrder: null },
        { Name: "LightningSales", Label: "Sales", SortOrder: 5, UserSortOrder: 1 },
        { Name: "Finances", Label: "Finances", SortOrder: 3, UserSortOrder: null }, // namespaced, bare Name
        { Name: "hrns__HR", Label: "Human Resources", SortOrder: 4, UserSortOrder: null }, // namespaced, prefixed Name
        { Name: "ClassicAloha", Label: "Classic", SortOrder: 0, UserSortOrder: null }, // no Lightning AppDefinition
        { Name: "Bad", Label: "Bad", SortOrder: 6, UserSortOrder: null }, // invalid id
    ] };
    route = (url) => {
        if (url.includes("01gDEFS-2000")) return json(defsPage2);
        const q = soql(url);
        if (q.includes("FROM AppDefinition")) return json(defsPage1);
        if (q.includes("FROM UserAppMenuItem")) return json(menu);
        return null;
    };
    fetchCalls = [];
    r = await send({ action: "apps" });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.deepStrictEqual(r.apps, [
        { id: "06m000000000001AAA", label: "Sales", console: false },
        { id: "06m000000000002AAA", label: "Sales Console", console: true },
        { id: "06m000000000004AAA", label: "Finances", console: false },
        { id: "06m000000000005AAA", label: "Human Resources", console: true },
    ]);
    console.log("PASS apps: joined, launcher order (UserSortOrder then SortOrder), Classic/invisible/bad-id excluded, namespaced matched both ways");
    const qs = fetchCalls.map(soql).join("\n");
    assert(qs.includes("FROM AppDefinition WHERE UiType = 'Lightning'"));
    assert(qs.includes("FROM UserAppMenuItem WHERE IsVisible = true AND Type = 'TabSet'"));
    assert(fetchCalls.some((u) => u === "https://acme.my.salesforce.com/services/data/v60.0/query/01gDEFS-2000"));
    console.log("PASS apps: queries + nextRecordsUrl followed");

    // An unsafe nextRecordsUrl is not followed.
    route = (url) => {
        const q = soql(url);
        if (q.includes("FROM AppDefinition")) return json({ records: defsPage1.records, nextRecordsUrl: "@evil.example.com/x" });
        if (q.includes("FROM UserAppMenuItem")) return json(menu);
        return null;
    };
    fetchCalls = [];
    r = await send({ action: "apps" });
    assert.strictEqual(fetchCalls.length, 2);
    assert(fetchCalls.every((u) => u.startsWith("https://acme.my.salesforce.com/services/data/")));
    console.log("PASS apps: unsafe nextRecordsUrl ignored");

    route = (url) => (url.includes("UserAppMenuItem") ? { ok: false, status: 500, json: async () => ({}) } : null);
    r = await send({ action: "apps" });
    assert.strictEqual(r.ok, false);
    console.log("PASS apps: API failure → ok:false (palette retries)");

    // ---- fields ----
    let pages = 0;
    route = (url) => {
        if (url.includes("/query/01gFLD-")) {
            pages++;
            const n = +url.split("01gFLD-")[1];
            return json({ records: [{ QualifiedApiName: "F" + n + "__c", Label: "F" + n, DurableId: "Account.00N00000000000" + n, DataType: "Text(10)" }],
                nextRecordsUrl: "/services/data/v60.0/query/01gFLD-" + (n + 1) });
        }
        if (soql(url).includes("FROM FieldDefinition")) {
            pages++;
            return json({ records: [
                { QualifiedApiName: "Industry", Label: "Industry", DurableId: "Account.Industry", DataType: "Picklist" },
                { QualifiedApiName: "Tier__c", Label: "Tier", DurableId: "Account.00N5g00000AbCdE", DataType: "Picklist" },
            ], nextRecordsUrl: "/services/data/v60.0/query/01gFLD-1" });
        }
        return null;
    };
    fetchCalls = [];
    r = await send({ action: "fields", object: "Account" });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(pages, 5, "max 5 pages");
    assert.deepStrictEqual(r.fields[0], { api: "Industry", label: "Industry", type: "Picklist", key: "Industry" });
    assert.deepStrictEqual(r.fields[1], { api: "Tier__c", label: "Tier", type: "Picklist", key: "00N5g00000AbCdE" });
    assert.strictEqual(r.fields.length, 6);
    assert(soql(fetchCalls[0]).includes("FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Account'"));
    console.log("PASS fields: standard key 'Industry', custom key '00N…', pagination capped at 5 pages");

    for (const bad of ["Account' OR", "Account'", "", "a b", "Acc;ount", 42, undefined]) {
        fetchCalls = [];
        r = await send({ action: "fields", object: bad });
        assert.deepStrictEqual([r.ok, r.error, fetchCalls.length], [false, "Invalid object name", 0], String(bad));
    }
    console.log("PASS fields: object validation rejects injection / bad input with no API call");

    // ---- listViews: list views plus the last 5 viewed records ----
    fetchCalls = [];
    route = (url) => {
        if (soql(url).includes("FROM ListView")) return json({ records: [{ Id: "00B000000000001AAA", Name: "All Accounts", DeveloperName: "AllAccounts" }] });
        if (soql(url).includes("FROM RecentlyViewed")) return json({ records: [
            { Id: "001000000000001AAA", Name: "Acme" },
            { Id: "../evil", Name: "Bad" },
            { Id: "001000000000002AAA", Name: null },
        ] });
        return null;
    };
    r = await send({ action: "listViews", object: "Account" });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.deepStrictEqual(r.listViews, [{ id: "00B000000000001AAA", label: "All Accounts", api: "AllAccounts" }]);
    assert.deepStrictEqual(r.records, [{ id: "001000000000001AAA", name: "Acme" }, { id: "001000000000002AAA", name: "001000000000002AAA" }]);
    const recentQ = fetchCalls.map(soql).find((q) => q.includes("FROM RecentlyViewed"));
    assert(recentQ.includes("WHERE Type = 'Account'") && recentQ.includes("ORDER BY LastViewedDate DESC") && recentQ.includes("LIMIT 5"), recentQ);

    // A failed RecentlyViewed query still returns the list views.
    route = (url) => {
        if (soql(url).includes("FROM ListView")) return json({ records: [{ Id: "00B000000000001AAA", Name: "All Accounts", DeveloperName: "AllAccounts" }] });
        if (soql(url).includes("FROM RecentlyViewed")) return { ok: false, status: 400, json: async () => [{ message: "not supported" }] };
        return null;
    };
    r = await send({ action: "listViews", object: "Account" });
    assert.deepStrictEqual([r.ok, r.listViews.length, r.records], [true, 1, []], JSON.stringify(r));
    route = () => null;
    console.log("PASS listViews: last 5 viewed records, ids checked, optional on failure");

    // ---- recent: all objects or one object, 20 at most ----
    route = (url) => (soql(url).includes("FROM RecentlyViewed") ? json({ records: [{ Id: "001000000000001AAA", Name: "Acme", Type: "Account" }] }) : null);
    fetchCalls = [];
    r = await send({ action: "recent" });
    assert.deepStrictEqual(r.records, [{ Id: "001000000000001AAA", Name: "Acme", attributes: { type: "Account" } }]);
    assert(soql(fetchCalls[0]).includes("Type != 'ListView'") && soql(fetchCalls[0]).includes("LIMIT 20"), soql(fetchCalls[0]));
    fetchCalls = [];
    r = await send({ action: "recent", object: "Account" });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert(soql(fetchCalls[0]).includes("WHERE Type = 'Account'") && soql(fetchCalls[0]).includes("LIMIT 20"), soql(fetchCalls[0]));
    for (const bad of ["Account' OR", "", 42]) {
        fetchCalls = [];
        r = await send({ action: "recent", object: bad });
        assert.deepStrictEqual([r.ok, r.error, fetchCalls.length], [false, "Invalid object name", 0], String(bad));
    }
    route = () => null;
    console.log("PASS recent: all objects or one object's last 20, object validated");

    // ---- count: total, then each record type's (Master for the rest) ----
    route = (url) => {
        const q = soql(url);
        if (q.includes("FROM RecordType")) return json({ records: [
            { Id: "012000000000001AAA", Name: "Customer", IsActive: true },
            { Id: "012000000000002AAA", Name: "Partner", IsActive: true },
            { Id: "012000000000003AAA", Name: "Old", IsActive: false },
            { Id: "012000000000004AAA", Name: "Retired", IsActive: false },
        ] });
        if (q.includes("GROUP BY RecordTypeId")) return json({ records: [
            { RecordTypeId: "012000000000001AAA", n: 8020 },
            { RecordTypeId: "012000000000003AAA", n: 5 },
            { RecordTypeId: null, n: 200 },
            { RecordTypeId: "012000000000000AAA", n: 20 },
        ] });
        return null;
    };
    r = await send({ action: "count", object: "Account" });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.total, 8245);
    assert.deepStrictEqual(r.recordTypes, [
        { name: "Customer", count: 8020, active: true },
        { name: "Partner", count: 0, active: true },
        { name: "Old", count: 5, active: false },
        { name: "Master", count: 220, active: true },
    ]);

    // No record types: a plain COUNT(), no GROUP BY (RecordTypeId doesn't exist yet).
    fetchCalls = [];
    route = (url) => (soql(url) === "SELECT COUNT() FROM Lead" ? json({ totalSize: 42, records: [] }) : null);
    r = await send({ action: "count", object: "Lead" });
    assert.deepStrictEqual([r.ok, r.total, r.recordTypes], [true, 42, []], JSON.stringify(r));
    assert(!fetchCalls.map(soql).some((q) => q.includes("GROUP BY")));

    fetchCalls = [];
    for (const object of ["Account WHERE Id != null", "Account'--", "", null]) {
        r = await send({ action: "count", object });
        assert.strictEqual(r.ok, false);
    }
    assert.strictEqual(fetchCalls.length, 0);
    route = () => null;
    console.log("PASS count: total, record types with Master, plain count without them, name checked");

    // ---- limits: each limit's Max and Remaining, nothing else ----
    route = (url) => (url.includes("/limits/") ? json({
        DailyApiRequests: { Max: 15000, Remaining: 14000, "Ant Migration Tool": { Max: 0, Remaining: 0 } },
        DataStorageMB: { Max: 5, Remaining: 5 },
        "<b>bad</b>": { Max: 1, Remaining: 0 },
        Broken: { Max: "lots" },
    }) : null);
    fetchCalls = [];
    r = await send({ action: "limits" });
    assert.deepStrictEqual(r.limits, [{ name: "DailyApiRequests", max: 15000, remaining: 14000 }, { name: "DataStorageMB", max: 5, remaining: 5 }]);
    assert(fetchCalls[0].includes("/limits/"), fetchCalls[0]);
    route = () => null;
    console.log("PASS limits: Max and Remaining per limit, bad names and values dropped");

    storage = { settings: { liveOrgAccess: false } };
    for (const action of ["apps", "fields", "count", "limits"]) {
        fetchCalls = [];
        r = await send({ action, object: "Account" });
        assert.deepStrictEqual([r.ok, r.error, fetchCalls.length], [false, "Live org access is off", 0]);
    }
    storage = {};
    console.log("PASS apps/fields/count/limits gated by liveOrgAccess");

    r = await new Promise((resolve) => listener({ type: "palette", action: "fields", object: "Account", host: "evil.example.com" }, T, resolve));
    assert.strictEqual(r.ok, false);
    console.log("PASS non-Salesforce host refused");
    console.log("ALL PASS");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
