// Background worker: the "flowVersions" action, which Recent Setup uses to move
// a saved Flow link to the flow's current version. Validation, the query,
// the id mapping and live-access gating, with a stubbed fetch.
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
const send = (msg, sender = T) =>
    new Promise((resolve) => listener({ type: "palette", host: "acme.my.salesforce.com", ...msg }, sender, (x) => resolve(JSON.parse(JSON.stringify(x)))));
const soql = (url) => decodeURIComponent((url.split("?q=")[1] || "").replace(/\+/g, " "));

const A = "300000000000001AAA", B = "300000000000002AAA", C = "300000000000003AAA", D = "300000000000004AAA";

(async () => {
    let r;
    route = (url) =>
        soql(url).includes("FROM FlowDefinitionView")
            ? json({ records: [
                { DurableId: A, LatestVersionId: "301000000000006AAA", ActiveVersionId: "301000000000005AAA" },
                { DurableId: B, LatestVersionId: null, ActiveVersionId: "301000000000009AAA" },
                { DurableId: C, LatestVersionId: "../evil", ActiveVersionId: null },
            ] })
            : null;
    fetchCalls = [];
    r = await send({ action: "flowVersions", flowIds: [A, B, C, D] });
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.deepStrictEqual(r.versions, { [A]: "301000000000006AAA", [B]: "301000000000009AAA" });
    console.log("PASS latest version first, then active; bad ids and missing flows left out");
    assert.strictEqual(fetchCalls.length, 1);
    assert(soql(fetchCalls[0]).includes(`FROM FlowDefinitionView WHERE DurableId IN ('${A}','${B}','${C}','${D}')`));
    console.log("PASS one query for all the flows");

    const eleven = Array.from({ length: 11 }, (_, i) => "3000000000000" + String(10 + i) + "AAA");
    for (const bad of [[], [A + "' OR"], ["301000000000006AAA"], [A, 42], eleven, "x", undefined]) {
        fetchCalls = [];
        r = await send({ action: "flowVersions", flowIds: bad });
        assert.deepStrictEqual([r.ok, r.error, fetchCalls.length], [false, "Invalid flow ids", 0], JSON.stringify(bad));
    }
    console.log("PASS bad flow ids refused with no API call");

    storage = { settings: { liveOrgAccess: false } };
    fetchCalls = [];
    r = await send({ action: "flowVersions", flowIds: [A] });
    assert.deepStrictEqual([r.ok, r.error, fetchCalls.length], [false, "Live org access is off", 0]);
    storage = {};
    console.log("PASS gated by liveOrgAccess");

    fetchCalls = [];
    r = await send({ action: "flowVersions", flowIds: [A] }, { id: "EXT", tab: { url: "https://other.lightning.force.com/" } });
    assert.deepStrictEqual([r.ok, fetchCalls.length], [false, 0]);
    console.log("PASS a page can't ask about another org");
    console.log("ALL PASS");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
