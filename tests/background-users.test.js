// Background worker: user lookup for the palette ("users" action for the
// "login" verb and the 5 users plain search lists; "search" leaves them out).
// Queries User directly (not the global search), escapes the term for LIKE,
// maps rows to the record shape the palette expects, and honors live access.
// A newer search or user lookup from a tab aborts the one before it.
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const ROOT = require("path").resolve(__dirname, "..");

let fetchCalls = [], storage = {}, route = () => null;
let listener;
const json = (d) => ({ ok: true, status: 200, json: async () => d });
const ctx = {
    console, URL, Set, Promise, Date, encodeURIComponent, AbortController,
    fetch: async (url, opts) => {
        fetchCalls.push(url);
        const r = route(url, opts);
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

    // Plain search asks for its users with limit 5; any other limit is 20.
    fetchCalls = [];
    await send({ action: "users", term: "Nat", limit: 5 });
    await send({ action: "users", term: "Nat", limit: "5) OR (Id != null" });
    assert.deepStrictEqual(fetchCalls.map((u) => soql(u).split(" LIMIT ")[1]), ["5", "20"]);
    console.log("PASS users limit 5 for plain search, 20 otherwise");

    // Plain search leaves users out: no User query, and User hits from the
    // global search are dropped (the palette lists them from "users").
    route = (url) => {
        if (url.includes("/search/"))
            return json({ searchRecords: [
                { Id: "001000000000001AAA", attributes: { type: "Account" } },
                { Id: "005000000000009AAA", attributes: { type: "User" } },
            ] });
        if (soql(url).includes("FROM Account")) return json({ records: [{ Id: "001000000000001AAA", Name: "Nathan Corp" }] });
        return null;
    };
    fetchCalls = [];
    r = await send({ action: "search", term: "Nat" });
    assert.deepStrictEqual([r.ok, r.records.map((x) => [x.attributes.type, x.Name])], [true, [["Account", "Nathan Corp"]]]);
    assert.ok(!fetchCalls.some((u) => soql(u).includes("FROM User")), "no User query");
    console.log("PASS search leaves users out");

    // A newer search from the same tab aborts the one still running; a user
    // lookup (sent alongside) doesn't.
    let oldSignal = null;
    route = (url, opts) => {
        if (!url.includes("Old")) return url.includes("/search/") ? json({ searchRecords: [] }) : null;
        oldSignal = opts.signal;
        return new Promise((_, reject) => {
            const stop = () => reject(new Error("aborted"));
            if (opts.signal.aborted) stop();
            opts.signal.addEventListener("abort", stop);
        });
    };
    const oldSearch = send({ action: "search", term: "Old" });
    while (!oldSignal) await new Promise((res) => setTimeout(res, 5));
    r = await send({ action: "users", term: "Nat", limit: 5 });
    assert.deepStrictEqual([r.ok, oldSignal.aborted], [true, false]);
    r = await send({ action: "search", term: "New" });
    assert.deepStrictEqual([r.ok, oldSignal.aborted, await oldSearch], [true, true, { ok: false, error: "aborted" }]);
    console.log("PASS newer search aborts the older one");

    // Gated by live org access like other data actions.
    storage = { settings: { liveOrgAccess: false } }; fetchCalls = [];
    r = await send({ action: "users", term: "Nath" });
    assert.deepStrictEqual([r.ok, r.error, fetchCalls.length], [false, "Live org access is off", 0]);
    storage = {};
    console.log("PASS users blocked when live org access is off");
    console.log("ALL PASS");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
