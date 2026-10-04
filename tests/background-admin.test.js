// Background worker: the "admin" action (palette search over profiles,
// permission sets, flows, Apex classes and triggers, and custom metadata
// types). Ids are checked before they reach the palette's Setup URLs, a
// failing query only drops its own list, and live access gates it.
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
            ] });
        if (q.includes("FROM EntityDefinition"))
            return json({ records: [
                { DurableId: "01I000000000009AAA", QualifiedApiName: "Feature_Flag__mdt", Label: "Feature Flag", NamespacePrefix: null, KeyPrefix: "m00" },
                { DurableId: "01I000000000008AAA", QualifiedApiName: "acme__Config__mdt", Label: "Config", NamespacePrefix: "acme", KeyPrefix: null },
                { DurableId: "01I000000000007AAA", QualifiedApiName: "Almost_mdtx", Label: "Not a type", KeyPrefix: "m01" }, // LIKE "_" wildcard
                { DurableId: "Account", QualifiedApiName: "Bad__mdt", Label: "Bad id", KeyPrefix: "m02" },
                { DurableId: "01I000000000006AAA", QualifiedApiName: "Weird__mdt", Label: "Weird prefix", KeyPrefix: "m0/" },
            ] });
        if (q.includes("FROM Profile")) return json({ records: [{ Id: "00e000000000001AAA", Name: "System Administrator" }] });
        return null;
    };
    fetchCalls = [];
    let r = await send({ action: "admin" });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    const qs = fetchCalls.map(soql);
    assert(qs.includes("SELECT Id, Name, NamespacePrefix FROM ApexClass ORDER BY NamespacePrefix NULLS FIRST, Name LIMIT 2000"));
    assert(qs.includes("SELECT Id, Name, NamespacePrefix, TableEnumOrId FROM ApexTrigger ORDER BY NamespacePrefix NULLS FIRST, Name LIMIT 2000"));
    assert(qs.includes("SELECT DurableId, QualifiedApiName, Label, NamespacePrefix, KeyPrefix FROM EntityDefinition WHERE QualifiedApiName LIKE '%__mdt'"));
    assert(fetchCalls.every((u) => u.startsWith("https://acme.my.salesforce.com/services/data/v60.0/query/")));
    console.log("PASS admin queries ApexClass, ApexTrigger and EntityDefinition through REST query");

    assert.deepStrictEqual(r.apexClasses, [
        { Id: "01p000000000001AAA", Name: "AccountService", NamespacePrefix: null },
        { Id: "01p000000000002AAA", Name: "Helper", NamespacePrefix: "acme" },
        { Id: "01p000000000003AAA", Name: "OddNs", NamespacePrefix: null },
    ]);
    assert.deepStrictEqual(r.apexTriggers, [
        { Id: "01q000000000001AAA", Name: "AccountTrigger", NamespacePrefix: null, Object: "Account" },
        { Id: "01q000000000002AAA", Name: "InvoiceTrigger", NamespacePrefix: null, Object: null },
    ]);
    console.log("PASS Apex rows trimmed to the fields the palette uses; bad Ids dropped");

    assert.deepStrictEqual(r.metadataTypes, [
        { Id: "01I000000000008AAA", ApiName: "acme__Config__mdt", Label: "Config", KeyPrefix: null },
        { Id: "01I000000000009AAA", ApiName: "Feature_Flag__mdt", Label: "Feature Flag", KeyPrefix: "m00" },
        { Id: "01I000000000006AAA", ApiName: "Weird__mdt", Label: "Weird prefix", KeyPrefix: null },
    ]);
    console.log("PASS custom metadata types: __mdt only, 01I ids only, key prefix checked, sorted by label");

    // One failing query drops only its own list.
    route = (url) => (soql(url).includes("FROM ApexClass") ? { ok: false, status: 400, json: async () => [{ errorCode: "INVALID_TYPE" }] } : null);
    r = await send({ action: "admin" });
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual([r.apexClasses, r.apexTriggers, r.metadataTypes, r.profiles], [[], [], [], []]);
    console.log("PASS a forbidden Apex query leaves the rest of the search working");

    storage = { settings: { liveOrgAccess: false } };
    fetchCalls = [];
    r = await send({ action: "admin" });
    assert.deepStrictEqual([r.ok, r.error, fetchCalls.length], [false, "Live org access is off", 0]);
    storage = {};
    console.log("PASS admin gated by liveOrgAccess");
    console.log("ALL PASS");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
