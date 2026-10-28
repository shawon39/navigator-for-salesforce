// Background worker: "peek" (a record's compact layout for the palette's
// preview), "hop" (the record's lookups and related lists) and "recentWork"
// (Setup items changed lately). Values come back as plain strings, Ids and
// names are checked before they reach palette URLs, and live access gates all three.
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const ROOT = require("path").resolve(__dirname, "..");

let fetchCalls = [], storage = {}, route = () => null;
let listener;
const json = (d) => ({ ok: true, status: 200, json: async () => d });
const ctx = {
    console, URL, Set, Map, Promise, Date, encodeURIComponent, isNaN,
    fetch: async (url) => {
        fetchCalls.push(url);
        return route(url) || json({ records: [] });
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

const T = { id: "EXT", tab: { url: "https://acme.lightning.force.com/lightning/r/Opportunity/006000000000001AAA/view" } };
const send = (msg) => new Promise((resolve) => listener({ type: "palette", host: "acme.my.salesforce.com", ...msg }, T, (x) => resolve(JSON.parse(JSON.stringify(x)))));
const soql = (url) => decodeURIComponent((url.split("?q=")[1] || "").replace(/\+/g, " "));

const OPP = "006000000000001AAA";
const field = (label, apiName, lookupIdApiName) => ({ label, lookupIdApiName: lookupIdApiName || null, layoutComponents: [{ componentType: "Field", apiName }] });
// record-ui: layouts -> object -> record type -> layout type -> mode.
function recordUi(layoutType, items) {
    return {
        layouts: { Opportunity: { "012000000000000AAA": { [layoutType]: { View: { sections: [{ layoutRows: [{ layoutItems: items }] }] } } } } },
        objectInfos: {
            Opportunity: {
                label: "Opportunity",
                nameFields: ["Name"],
                fields: {
                    AccountId: { relationshipName: "Account", referenceToInfos: [{ apiName: "Account" }] },
                    OwnerId: { relationshipName: "Owner", referenceToInfos: [{ apiName: "User" }] },
                    Bad__c: { relationshipName: "Bad__r", referenceToInfos: [{ apiName: "Bad'Type" }] },
                },
            },
        },
        records: {
            [OPP]: {
                apiName: "Opportunity",
                id: OPP,
                recordTypeId: "012000000000000AAA",
                fields: {
                    Name: { value: "Globex — Renewal FY27", displayValue: null },
                    Amount: { value: 125000, displayValue: "$125,000.00" },
                    CloseDate: { value: "2027-01-31", displayValue: "1/31/2027" },
                    NextStep: { value: null, displayValue: null },
                    AccountId: { value: "001000000000001AAA", displayValue: null },
                    Account: { displayValue: "Globex Inc.", value: { apiName: "Account", id: "001000000000001AAA", fields: {} } },
                    OwnerId: { value: "005000000000001AAA", displayValue: null },
                    Owner: { displayValue: "Jane Cooper", value: { apiName: "User", id: "005000000000001AAA", fields: {} } },
                    Bad__c: { value: "a00000000000001AAA", displayValue: null },
                    Bad__r: { displayValue: "Odd", value: null },
                    BillingStreet: { value: "1 Main St", displayValue: null },
                    BillingCity: { value: "Springfield", displayValue: null },
                },
            },
        },
    };
}

(async () => {
    // ---- peek ----
    route = (url) => (url.includes("/ui-api/record-ui/") ? json(recordUi("Compact", [
        field("Opportunity Name", "Name"),
        field("Amount", "Amount"),
        field("Close Date", "CloseDate"),
        field("Account Name", "AccountId", "AccountId"),
        field("Next Step", "NextStep"),
        { label: "Address", layoutComponents: [{ componentType: "Field", apiName: "BillingStreet" }, { componentType: "Field", apiName: "BillingCity" }] },
    ])) : null);
    fetchCalls = [];
    let r = await send({ action: "peek", recordId: OPP });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(fetchCalls[0], `https://acme.my.salesforce.com/services/data/v60.0/ui-api/record-ui/${OPP}?layoutTypes=Compact&modes=View`);
    assert.deepStrictEqual(r.record, {
        id: OPP,
        type: "Opportunity",
        typeLabel: "Opportunity",
        name: "Globex — Renewal FY27",
        fields: [
            { label: "Amount", value: "$125,000.00", lookup: null },
            { label: "Close Date", value: "1/31/2027", lookup: null },
            { label: "Account Name", value: "Globex Inc.", lookup: { id: "001000000000001AAA", type: "Account" } },
            { label: "Next Step", value: "", lookup: null },
            { label: "Address", value: "1 Main St, Springfield", lookup: null },
        ],
    });
    console.log("PASS peek: compact layout fields in order, display values, lookup names, name row dropped");

    for (const bad of ["../x", "001'OR'1", ""]) {
        fetchCalls = [];
        r = await send({ action: "peek", recordId: bad });
        assert.deepStrictEqual([r.ok, fetchCalls.length], [false, 0]);
    }
    console.log("PASS peek rejects bad record Ids before any request");

    // ---- hop ----
    route = (url) => {
        if (url.includes("/ui-api/record-ui/"))
            return json(recordUi("Full", [
                field("Opportunity Name", "Name"),
                field("Account Name", "AccountId", "AccountId"),
                field("Opportunity Owner", "OwnerId", "OwnerId"),
                field("Odd", "Bad__c", "Bad__c"),
                field("Amount", "Amount"),
            ]));
        if (url.includes("/ui-api/related-list-info/"))
            return json({ relatedLists: [
                { label: "Contact Roles", relatedListId: "OpportunityContactRoles" },
                { label: "Quotes", relatedListId: "Quotes" },
                { label: "Evil", relatedListId: "../x" },
                { label: null, relatedListId: "NoLabel" },
            ] });
        return null;
    };
    fetchCalls = [];
    r = await send({ action: "hop", recordId: OPP });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(fetchCalls[1], "https://acme.my.salesforce.com/services/data/v60.0/ui-api/related-list-info/Opportunity?recordTypeId=012000000000000AAA");
    assert.deepStrictEqual(r.lookups, [
        { label: "Account Name", name: "Globex Inc.", id: "001000000000001AAA", type: "Account" },
        { label: "Opportunity Owner", name: "Jane Cooper", id: "005000000000001AAA", type: "User" },
    ]);
    assert.deepStrictEqual(r.lists, [
        { label: "Contact Roles", id: "OpportunityContactRoles" },
        { label: "Quotes", id: "Quotes" },
    ]);
    assert.deepStrictEqual([r.id, r.type, r.name], [OPP, "Opportunity", "Globex — Renewal FY27"]);
    console.log("PASS hop: layout lookups with names and types; bad types and list ids dropped");

    route = (url) => (url.includes("/ui-api/related-list-info/") ? { ok: false, status: 404, json: async () => [] } : route0(url));
    const route0 = (url) => (url.includes("/ui-api/record-ui/") ? json(recordUi("Full", [field("Account Name", "AccountId", "AccountId")])) : null);
    r = await send({ action: "hop", recordId: OPP });
    assert.deepStrictEqual([r.ok, r.lookups.length, r.lists], [true, 1, []]);
    console.log("PASS hop: a failed related-list request only drops the lists");

    // ---- recentWork ----
    const day = (n) => new Date(Date.UTC(2026, 9, 29 - n, 12)).toISOString().replace("Z", "+0000");
    const ME = "005000000000001AAA", MARCUS = "005000000000002AAA";
    route = (url) => {
        if (url.endsWith("/services/oauth2/userinfo")) return json({ user_id: ME, organization_id: "00D000000000001AAA" });
        const q = soql(url);
        if (q.includes("FROM ApexClass"))
            return json({ records: [
                { Id: "01p000000000001AAA", Name: "OpportunityTriggerHandler", LastModifiedDate: day(0), LastModifiedById: ME },
                { Id: "../evil", Name: "Bad", LastModifiedDate: day(0), LastModifiedById: ME },
            ] });
        if (q.includes("FROM PermissionSet"))
            return json({ records: [{ Id: "0PS000000000001AAA", Label: "Sales Ops Access", LastModifiedDate: day(1), LastModifiedById: MARCUS }] });
        if (q.includes("FROM Flow "))
            return json({ records: [
                { Id: "301000000000002AAA", DefinitionId: "300000000000001AAA", MasterLabel: "Lead Routing", LastModifiedDate: day(2), LastModifiedById: ME },
                { Id: "301000000000001AAA", DefinitionId: "300000000000001AAA", MasterLabel: "Lead Routing", LastModifiedDate: day(5), LastModifiedById: ME },
            ] });
        if (q.includes("FROM CustomField"))
            return json({ records: [
                { Id: "00N000000000001AAA", DeveloperName: "Renewal_Date", TableEnumOrId: "Opportunity", LastModifiedDate: day(3), LastModifiedById: MARCUS },
                { Id: "00N000000000002AAA", DeveloperName: "Odd", TableEnumOrId: "Bad'Name", LastModifiedDate: day(3), LastModifiedById: MARCUS },
            ] });
        if (q.includes("FROM User WHERE Id IN"))
            return json({ records: [{ Id: ME, Name: "Shakhawat Hossain" }, { Id: MARCUS, Name: "Marcus Chen" }] });
        return null;
    };
    fetchCalls = [];
    r = await send({ action: "recentWork" });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    const qs = fetchCalls.map(soql);
    assert(qs.some((q) => q.includes("FROM ApexClass WHERE NamespacePrefix = null AND LastModifiedDate = LAST_N_DAYS:30")));
    assert(fetchCalls.some((u) => u.includes("/tooling/query/") && soql(u).includes("FROM Flow WHERE")));
    assert(fetchCalls.some((u) => u.includes("/tooling/query/") && soql(u).includes("FROM CustomField WHERE NamespacePrefix = null")));
    assert(qs.includes(`SELECT Id, Name FROM User WHERE Id IN ('${ME}','${MARCUS}')`));
    assert.deepStrictEqual(
        r.items.map((i) => [i.kind, i.label, i.byName, i.mine]),
        [
            ["apexClass", "OpportunityTriggerHandler", "Shakhawat Hossain", true],
            ["permSet", "Sales Ops Access", "Marcus Chen", false],
            ["flow", "Lead Routing", "Shakhawat Hossain", true],
            ["field", "Renewal_Date__c", "Marcus Chen", false],
        ]
    );
    assert.deepStrictEqual([r.items[2].id, r.items[2].flow, r.items[3].object], ["301000000000002AAA", "300000000000001AAA", "Opportunity"]);
    console.log("PASS recentWork: newest first, newest version per flow, who changed it, bad rows dropped");

    route = (url) => (soql(url).includes("FROM Flow ") ? { ok: false, status: 400, json: async () => [] } : null);
    r = await send({ action: "recentWork" });
    assert.deepStrictEqual([r.ok, r.items], [true, []]);
    console.log("PASS recentWork: a failing query only drops its own rows");

    storage = { settings: { liveOrgAccess: false } };
    for (const action of ["peek", "hop", "recentWork"]) {
        fetchCalls = [];
        r = await send({ action, recordId: OPP });
        assert.deepStrictEqual([r.ok, r.error, fetchCalls.length], [false, "Live org access is off", 0]);
    }
    storage = {};
    console.log("PASS peek, hop and recentWork gated by liveOrgAccess");
    console.log("ALL PASS");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
