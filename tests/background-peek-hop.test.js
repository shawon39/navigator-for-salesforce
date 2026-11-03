// Background worker: "peek" (a record's compact layout for the palette's
// preview), "hop" (the record's lookups). Values come
// back as plain strings, Ids and names are checked before they reach palette
// URLs, and live access gates both.
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
                    CreatedById: { relationshipName: "CreatedBy", referenceToInfos: [{ apiName: "User" }] },
                    Bad__c: { relationshipName: "Bad__r", referenceToInfos: [{ apiName: "Bad'Type" }] },
                    Partner__c: { reference: true, relationshipName: "Partner__r", referenceToInfos: [{ apiName: "Account" }] },
                },
            },
        },
        records: {
            [OPP]: {
                apiName: "Opportunity",
                id: OPP,
                fields: {
                    Name: { value: "Globex &amp; Sons — Renewal FY27", displayValue: null },
                    Amount: { value: 125000, displayValue: "$125,000.00" },
                    CloseDate: { value: "2027-01-31", displayValue: "1/31/2027" },
                    NextStep: { value: null, displayValue: null },
                    AccountId: { value: "001000000000001AAA", displayValue: null },
                    Account: { displayValue: "Globex &amp; Sons", value: { apiName: "Account", id: "001000000000001AAA", fields: {} } },
                    OwnerId: { value: "005000000000001AAA", displayValue: null },
                    Owner: { displayValue: "Jane Cooper", value: { apiName: "User", id: "005000000000001AAA", fields: {} } },
                    CreatedById: { value: "005000000000001AAA", displayValue: null },
                    CreatedBy: { displayValue: "Jane Cooper", value: { apiName: "User", id: "005000000000001AAA", fields: {} } },
                    Bad__c: { value: "a00000000000001AAA", displayValue: null },
                    Bad__r: { displayValue: "Odd", value: null },
                    Partner__c: { value: "001000000000002AAA", displayValue: null },
                    Partner__r: { displayValue: "Initech", value: { apiName: "Account", id: "001000000000002AAA", fields: {} } },
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
        name: "Globex & Sons — Renewal FY27",
        fields: [
            { label: "Amount", value: "$125,000.00", lookup: null },
            { label: "Close Date", value: "1/31/2027", lookup: null },
            { label: "Account Name", value: "Globex & Sons", lookup: { id: "001000000000001AAA", type: "Account", field: "AccountId" } },
            { label: "Next Step", value: "", lookup: null },
            { label: "Address", value: "1 Main St, Springfield", lookup: null },
        ],
    });
    console.log("PASS peek: compact layout fields in order, values unescaped, lookup names, name row dropped");

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
                field("Created By", "CreatedById", "CreatedById"),
                field("Odd", "Bad__c", "Bad__c"),
                // Salesforce names "Id" as a custom lookup's lookupIdApiName.
                field("Partner", "Partner__c", "Id"),
                field("Amount", "Amount"),
            ]));
        return null;
    };
    fetchCalls = [];
    r = await send({ action: "hop", recordId: OPP });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.deepStrictEqual(r.lookups, [
        { label: "Account Name", name: "Globex & Sons", id: "001000000000001AAA", type: "Account" },
        { label: "Opportunity Owner", name: "Jane Cooper", id: "005000000000001AAA", type: "User" },
        { label: "Partner", name: "Initech", id: "001000000000002AAA", type: "Account" },
    ]);
    assert.deepStrictEqual([r.id, r.type, r.name, fetchCalls.length], [OPP, "Opportunity", "Globex & Sons — Renewal FY27", 1]);
    console.log("PASS hop: layout lookups (custom ones too) with names and types; Created By left out, bad types dropped, one request");

    storage = { settings: { liveOrgAccess: false } };
    for (const action of ["peek", "hop"]) {
        fetchCalls = [];
        r = await send({ action, recordId: OPP });
        assert.deepStrictEqual([r.ok, r.error, fetchCalls.length], [false, "Live org access is off", 0]);
    }
    storage = {};
    console.log("PASS peek and hop gated by liveOrgAccess");
    console.log("ALL PASS");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
