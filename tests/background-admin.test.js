// Background worker: the "admin" action (palette search over profiles,
// permission sets, flows and custom metadata types) and the "apex" action
// (Apex classes and triggers, asked apart so they don't hold up the rest).
// Ids are checked before they reach the palette's Setup URLs, only the fields
// the palette reads are sent, a failing query only drops its own list, and
// live access gates both.
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
        storage: { sync: { get: async () => storage }, onChanged: { addListener() {} } },
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
    const attrs = (type) => ({ type, url: "/services/data/v60.0/sobjects/" + type + "/x" });
    route = (url) => {
        const q = soql(url);
        if (q.includes("FROM ApexClass"))
            return json({ records: [
                { attributes: attrs("ApexClass"), Id: "01p000000000001AAA", Name: "AccountService", NamespacePrefix: null },
                { attributes: attrs("ApexClass"), Id: "01p000000000002AAA", Name: "Helper", NamespacePrefix: "acme" },
                { attributes: attrs("ApexClass"), Id: "../evil", Name: "Bad", NamespacePrefix: null },
                { attributes: attrs("ApexClass"), Id: "01p000000000003AAA", Name: "OddNs", NamespacePrefix: "a b" },
            ] });
        if (q.includes("FROM ApexTrigger"))
            return json({ records: [
                { attributes: attrs("ApexTrigger"), Id: "01q000000000001AAA", Name: "AccountTrigger", NamespacePrefix: null, TableEnumOrId: "Account" },
                { attributes: attrs("ApexTrigger"), Id: "01q000000000002AAA", Name: "InvoiceTrigger", NamespacePrefix: null, TableEnumOrId: "01I000000000001AAA" },
                { attributes: attrs("ApexTrigger"), Id: "01q000000000003AAA", Name: "VisitTrigger", NamespacePrefix: null, TableEnumOrId: "ServiceAppointment" },
                { attributes: attrs("ApexTrigger"), Id: "01q000000000004AAA", Name: "GoneTrigger", NamespacePrefix: null, TableEnumOrId: "01I000000000002" },
                { attributes: attrs("ApexTrigger"), Id: "01q000000000005AAA", Name: "OddTrigger", NamespacePrefix: null, TableEnumOrId: "Bad'Name" },
            ] });
        // Custom objects' names, by the 01I Ids triggers name them with.
        if (q.includes("DurableId IN"))
            return json({ records: [
                { DurableId: "01I000000000001", QualifiedApiName: "Invoice__c" },
                { DurableId: "01I000000000003", QualifiedApiName: "Not'Asked__c" },
            ] });
        if (q.includes("FROM EntityDefinition"))
            return json({ records: [
                { DurableId: "01I000000000009AAA", QualifiedApiName: "Feature_Flag__mdt", Label: "Feature Flag", NamespacePrefix: null, KeyPrefix: "m00" },
                { DurableId: "01I000000000008AAA", QualifiedApiName: "acme__Config__mdt", Label: "Config", NamespacePrefix: "acme", KeyPrefix: null },
                { DurableId: "01I000000000007AAA", QualifiedApiName: "Almost_mdtx", Label: "Not a type", KeyPrefix: "m01" }, // LIKE "_" wildcard
                { DurableId: "Account", QualifiedApiName: "Bad__mdt", Label: "Bad id", KeyPrefix: "m02" },
                { DurableId: "01I000000000006AAA", QualifiedApiName: "Weird__mdt", Label: "Weird prefix", KeyPrefix: "m0/" },
            ] });
        if (q.includes("FROM Profile")) return json({ records: [{ attributes: attrs("Profile"), Id: "00e000000000001AAA", Name: "System Administrator" }] });
        if (q.includes("FROM PermissionSet"))
            return json({ records: [{ attributes: attrs("PermissionSet"), Id: "0PS000000000001AAA", Name: "Sales_Ops", Label: "Sales Ops", Type: "Regular" }] });
        if (q.includes("FROM FlowDefinitionView"))
            return json({ records: [{
                attributes: attrs("FlowDefinitionView"), DurableId: "300000000000001AAA", ApiName: "Lead_Router", Label: "Lead Router",
                ProcessType: "AutoLaunchedFlow", IsActive: true, ActiveVersionId: "301000000000001AAA", LatestVersionId: "301000000000002AAA",
            }] });
        return null;
    };
    fetchCalls = [];
    let r = await send({ action: "admin" });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    let qs = fetchCalls.map(soql);
    assert(qs.some((s) => s.startsWith("SELECT Id, Name FROM Profile ORDER BY LastModifiedDate DESC")));
    assert(qs.some((s) => s.includes("FROM FlowDefinitionView ORDER BY LastModifiedDate DESC NULLS LAST")));
    assert(qs.includes("SELECT DurableId, QualifiedApiName, Label, NamespacePrefix, KeyPrefix FROM EntityDefinition WHERE QualifiedApiName LIKE '%__mdt'"));
    assert(!qs.some((s) => /FROM Apex(Class|Trigger)|DurableId IN/.test(s)));
    assert.strictEqual(r.apexClasses, undefined);
    console.log("PASS admin queries profiles, permission sets, flows and metadata types, not Apex");

    assert.deepStrictEqual(r.profiles, [{ Id: "00e000000000001AAA", Name: "System Administrator" }]);
    assert.deepStrictEqual(r.permissionSets, [{ Id: "0PS000000000001AAA", Name: "Sales_Ops", Label: "Sales Ops" }]);
    assert.deepStrictEqual(r.flows, [{
        DurableId: "300000000000001AAA", ApiName: "Lead_Router", Label: "Lead Router",
        ProcessType: "AutoLaunchedFlow", ActiveVersionId: "301000000000001AAA", LatestVersionId: "301000000000002AAA",
    }]);
    console.log("PASS admin sends only the fields the palette reads (no attributes)");

    fetchCalls = [];
    r = await send({ action: "apex" });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    qs = fetchCalls.map(soql);
    assert(qs.includes("SELECT Id, Name, NamespacePrefix FROM ApexClass ORDER BY NamespacePrefix NULLS FIRST, LastModifiedDate DESC LIMIT 10000"));
    assert(qs.includes("SELECT Id, Name, NamespacePrefix, TableEnumOrId FROM ApexTrigger ORDER BY NamespacePrefix NULLS FIRST, LastModifiedDate DESC LIMIT 10000"));
    assert(qs.includes(
        "SELECT DurableId, QualifiedApiName FROM EntityDefinition WHERE DurableId IN " +
        "('01I000000000001AAA','01I000000000001','01I000000000002')"
    ));
    assert(!qs.some((s) => /FROM (Profile|PermissionSet|FlowDefinitionView)|LIKE '%__mdt'/.test(s)));
    assert(fetchCalls.every((u) => u.startsWith("https://acme.my.salesforce.com/services/data/v60.0/query/")));
    assert.deepStrictEqual(Object.keys(r).sort(), ["apexClasses", "apexTriggers", "ok"]);
    console.log("PASS apex queries ApexClass, ApexTrigger and EntityDefinition through REST query");

    assert.deepStrictEqual(r.apexClasses, [
        { Id: "01p000000000001AAA", Name: "AccountService", NamespacePrefix: null },
        { Id: "01p000000000002AAA", Name: "Helper", NamespacePrefix: "acme" },
        { Id: "01p000000000003AAA", Name: "OddNs", NamespacePrefix: null },
    ]);
    assert.deepStrictEqual(r.apexTriggers, [
        { Id: "01q000000000001AAA", Name: "AccountTrigger", NamespacePrefix: null, Object: "Account" },
        { Id: "01q000000000002AAA", Name: "InvoiceTrigger", NamespacePrefix: null, Object: "Invoice__c" },
        { Id: "01q000000000003AAA", Name: "VisitTrigger", NamespacePrefix: null, Object: "ServiceAppointment" },
        { Id: "01q000000000004AAA", Name: "GoneTrigger", NamespacePrefix: null, Object: null },
        { Id: "01q000000000005AAA", Name: "OddTrigger", NamespacePrefix: null, Object: null },
    ]);
    console.log("PASS Apex rows trimmed to the fields the palette uses; bad Ids dropped");
    console.log("PASS triggers name their object: 18-letter standard names kept, custom objects looked up by 01I Id");

    r = await send({ action: "admin" });
    assert.deepStrictEqual(r.metadataTypes, [
        { Id: "01I000000000008AAA", ApiName: "acme__Config__mdt", Label: "Config", KeyPrefix: null },
        { Id: "01I000000000009AAA", ApiName: "Feature_Flag__mdt", Label: "Feature Flag", KeyPrefix: "m00" },
        { Id: "01I000000000006AAA", ApiName: "Weird__mdt", Label: "Weird prefix", KeyPrefix: null },
    ]);
    console.log("PASS custom metadata types: __mdt only, 01I ids only, key prefix checked, sorted by label");

    // One failing query drops only its own list.
    route = (url) => {
        const q = soql(url);
        if (q.includes("FROM ApexClass")) return { ok: false, status: 400, json: async () => [{ errorCode: "INVALID_TYPE" }] };
        if (q.includes("FROM ApexTrigger")) return json({ records: [{ Id: "01q000000000001AAA", Name: "AccountTrigger", NamespacePrefix: null, TableEnumOrId: "Account" }] });
        return null;
    };
    r = await send({ action: "apex" });
    assert.deepStrictEqual([r.ok, r.apexClasses, r.apexTriggers.map((t) => t.Name)], [true, [], ["AccountTrigger"]]);
    r = await send({ action: "admin" });
    assert.deepStrictEqual([r.ok, r.metadataTypes, r.profiles], [true, [], []]);
    console.log("PASS a forbidden Apex query leaves the rest of the search working");

    // Slow Apex paging doesn't hold up profiles, permission sets and flows.
    route = (url) => (soql(url).includes("FROM ApexClass") ? new Promise(() => {}) : null);
    send({ action: "apex" }); // never answers here
    r = await send({ action: "admin" });
    assert.strictEqual(r.ok, true);
    console.log("PASS admin answers while Apex is still loading");

    // Later batches are followed; one that fails keeps the batches before it.
    route = (url) => {
        if (soql(url).includes("FROM Profile")) return json({ records: [{ Id: "00e000000000001AAA", Name: "One" }], nextRecordsUrl: "/services/data/v60.0/query/01g-2000" });
        if (url.endsWith("/query/01g-2000")) return json({ records: [{ Id: "00e000000000002AAA", Name: "Two" }], nextRecordsUrl: "/services/data/v60.0/query/01g-4000" });
        if (url.endsWith("/query/01g-4000")) return { ok: false, status: 500, json: async () => [{ errorCode: "SERVER_ERROR" }] };
        return null;
    };
    r = await send({ action: "admin" });
    assert.deepStrictEqual(r.profiles.map((p) => p.Name), ["One", "Two"]);
    route = () => null;
    console.log("PASS admin lists follow later batches and keep them when one fails");

    storage = { settings: { liveOrgAccess: false } };
    fetchCalls = [];
    for (const action of ["admin", "apex"]) {
        r = await send({ action });
        assert.deepStrictEqual([r.ok, r.error, fetchCalls.length], [false, "Live org access is off", 0]);
    }
    storage = {};
    console.log("PASS admin and apex gated by liveOrgAccess");
    console.log("ALL PASS");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
