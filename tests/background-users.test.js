// Background worker: the "users" action behind the palette's "login" verb.
// Queries User directly (not the global search), escapes the term for LIKE,
// maps rows to the record shape the palette expects, and honors live access.
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
    // Queries User directly with LIKE on Name, Username and Alias.
    route = (url) =>
        url.includes("/query/")
            ? json({ records: [
                { Id: "005000000000001AAA", Name: "Nathaniel Williams", Username: "nat@acme.com", IsActive: true, Alias: "nwill", Profile: { Name: "System Administrator" } },
                { Id: "005000000000002AAA", Name: "Nathan Old", Username: "old@acme.com", IsActive: false, Alias: "nold", Profile: null },
            ] })
            : null;
    fetchCalls = [];
    r = await send({ action: "users", term: "  Nath " });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(!fetchCalls[0].includes("/search/"), "must not use the global search");
    assert.strictEqual(
        soql(fetchCalls[0]),
        "SELECT Id, Name, Username, IsActive, Profile.Name, Alias FROM User " +
            "WHERE Name LIKE '%Nath%' OR Username LIKE '%Nath%' OR Alias LIKE '%Nath%' " +
            "ORDER BY IsActive DESC, Name LIMIT 20"
    );
    console.log("PASS users queries User directly");

    assert.deepStrictEqual(r.records, [
        { Id: "005000000000001AAA", attributes: { type: "User" }, Name: "Nathaniel Williams", Username: "nat@acme.com", IsActive: true, Alias: "nwill", ProfileName: "System Administrator" },
        { Id: "005000000000002AAA", attributes: { type: "User" }, Name: "Nathan Old", Username: "old@acme.com", IsActive: false, Alias: "nold", ProfileName: null },
    ]);
    console.log("PASS users rows mapped to palette record shape");

    // Quote, backslash and LIKE wildcards are escaped.
    fetchCalls = [];
    await send({ action: "users", term: "o'b\\%_x" });
    assert.ok(soql(fetchCalls[0]).includes("Name LIKE '%o\\'b\\\\\\%\\_x%'"), soql(fetchCalls[0]));
    console.log("PASS users term escaped for SOQL LIKE");

    // Short terms return nothing without a request.
    fetchCalls = [];
    r = await send({ action: "users", term: " a " });
    assert.deepStrictEqual([r.ok, r.records.length, fetchCalls.length], [true, 0, 0]);
    console.log("PASS users short term empty without fetch");

    // Gated by live org access like other data actions.
    storage = { settings: { liveOrgAccess: false } }; fetchCalls = [];
    r = await send({ action: "users", term: "Nath" });
    assert.deepStrictEqual([r.ok, r.error, fetchCalls.length], [false, "Live org access is off", 0]);
    storage = {};
    console.log("PASS users blocked when live org access is off");
    console.log("ALL PASS");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
