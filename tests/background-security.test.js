// Background worker: message sender checks, host checks, Log in as validation,
// session errors, live-access gating and install behavior. Runs background.js
// in a Node vm with a stubbed chrome API.
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const ROOT = require("path").resolve(__dirname, "..");

let fetchCalls = [], created = [], storage = {}, commands = [];
let listener, installed, cookies = [];
const ctx = {
    console, URL, Set, Promise, Date, encodeURIComponent,
    fetch: async (url) => {
        fetchCalls.push(url);
        if (url.includes("userinfo")) return { ok: true, status: 200, json: async () => ({ organization_id: "00D000000000001", user_id: "005000000000001AAA" }) };
        if (url.includes("expired")) return { ok: false, status: 401, json: async () => [] };
        return { ok: true, status: 200, json: async () => ({ sobjects: [] }) };
    },
    importScripts: (p) => vm.runInContext(fs.readFileSync(ROOT + p, "utf8"), ctx),
    addEventListener() {},
    chrome: {
        runtime: {
            id: "EXT",
            onMessage: { addListener: (f) => (listener = f) },
            onInstalled: { addListener: (f) => (installed = f) },
            getURL: (p) => "chrome-extension://EXT/" + p,
            lastError: undefined,
        },
        cookies: {
            get: async ({ url }) => ({ value: "TOKEN-" + url }),
            getAll: async () => cookies,
        },
        storage: { sync: { get: async () => storage } },
        tabs: { create: async (o) => created.push(o.url), query: async () => [], update: async () => {} },
        windows: { create: async (o) => created.push(o.url) },
        commands: { onCommand: { addListener() {} }, getAll: (cb) => cb(commands) },
    },
};
ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + "/src/background/background.js", "utf8"), ctx);

const send = (msg, sender) => new Promise((resolve) => {
    const r = listener(msg, sender, resolve);
    if (r !== true) setTimeout(() => resolve("__no_async__"), 50);
});
const popup = { id: "EXT" };
const tab = (url) => ({ id: "EXT", tab: { url } });
const H = "acme.my.salesforce.com";

(async () => {
    let r;
    // foreign sender
    r = await send({ type: "palette", action: "objects", host: H }, { id: "OTHER" });
    assert.deepStrictEqual([r.ok, r.error], [false, "Unknown sender"]); console.log("PASS foreign sender rejected");

    // content script host mismatch
    r = await send({ type: "palette", action: "objects", host: "evil.my.salesforce.com" }, tab("https://acme.lightning.force.com/lightning/page/home"));
    assert.strictEqual(r.ok, false); console.log("PASS tab/host mismatch rejected:", r.error);
    // content script host match (lightning page vs my.salesforce host)
    fetchCalls = [];
    r = await send({ type: "palette", action: "objects", host: H }, tab("https://acme.lightning.force.com/lightning/page/home"));
    assert.strictEqual(r.ok, true); console.log("PASS matching lightning page accepted");

    // non-SF host
    r = await send({ type: "palette", action: "objects", host: "evil.com" }, popup);
    assert.strictEqual(r.ok, false); console.log("PASS non-Salesforce host rejected:", r.error);

    // orgs with host "" still works; expired cookie skipped
    cookies = [
        { domain: ".live.my.salesforce.com", value: "x" },
        { domain: ".old.my.salesforce.com", value: "x", expirationDate: Date.now() / 1000 - 60 },
    ];
    r = await send({ type: "palette", action: "orgs", host: "" }, popup);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(JSON.stringify(r.orgs.map((o) => o.apiHost)), JSON.stringify(["live.my.salesforce.com"])); console.log("PASS orgs works, expired cookie skipped");

    // loginAs bad userId
    fetchCalls = []; created = [];
    r = await send({ type: "palette", action: "loginAs", host: H, userId: "005xx&oid=1" }, popup);
    assert.deepStrictEqual([r.ok, r.error], [false, "Invalid user Id"]);
    assert.strictEqual(fetchCalls.length + created.length, 0); console.log("PASS loginAs bad userId rejected");

    // loginAs //evil targetPath falls back
    r = await send({ type: "palette", action: "loginAs", host: H, userId: "005000000000002", targetPath: "//evil.com/x" }, popup);
    assert.strictEqual(r.ok, true);
    const u = new URL(created[0]);
    assert.strictEqual(u.host, H);
    assert.strictEqual(u.searchParams.get("targetURL"), "/home/home.jsp");
    assert.strictEqual(u.searchParams.get("suorgadminid"), "005000000000002"); console.log("PASS //evil targetPath falls back:", created[0]);
    // good targetPath kept
    created = [];
    r = await send({ type: "palette", action: "loginAs", host: H, userId: "005000000000002", targetPath: "/lightning/o/Account/list" }, popup);
    assert.strictEqual(new URL(created[0]).searchParams.get("targetURL"), "/lightning/o/Account/list"); console.log("PASS safe targetPath kept");

    // sfApiHost VF
    assert.strictEqual(ctx.sfApiHost("acme--c.vf.force.com"), "acme.my.salesforce.com");
    assert.strictEqual(ctx.sfApiHost("acme--dev--c.sandbox.vf.force.com"), "acme--dev.sandbox.my.salesforce.com");
    assert.strictEqual(ctx.sfApiHost("acme--dev.sandbox.lightning.force.com"), "acme--dev.sandbox.my.salesforce.com");
    assert.strictEqual(ctx.sfApiHost("acme.my.salesforce-setup.com"), "acme.my.salesforce.com"); console.log("PASS sfApiHost VF mapping");
    // VF page content script to its own org is accepted
    r = await send({ type: "palette", action: "objects", host: "acme--c.vf.force.com" }, tab("https://acme--c.vf.force.com/apex/X"));
    assert.strictEqual(r.ok, true); console.log("PASS VF page accepted");

    // search "?" empty w/o fetch
    fetchCalls = [];
    r = await send({ type: "palette", action: "search", host: H, term: "?" }, popup);
    assert.deepStrictEqual([r.ok, r.records.length, fetchCalls.length], [true, 0, 0]); console.log("PASS search '?' empty without fetch");

    // 401 message
    r = await send({ type: "palette", action: "objects", host: "expired.my.salesforce.com" }, popup);
    assert.strictEqual(r.error, "Session expired — log in to Salesforce again"); console.log("PASS 401 mapped");

    // liveOrgAccess off
    storage = { settings: { liveOrgAccess: false } }; fetchCalls = [];
    r = await send({ type: "palette", action: "objects", host: H }, popup);
    assert.deepStrictEqual([r.ok, r.error, fetchCalls.length], [false, "Live org access is off", 0]);
    r = await send({ type: "palette", action: "orgs", host: "" }, popup);
    assert.strictEqual(r.ok, true); console.log("PASS liveOrgAccess off blocks data, not orgs");
    storage = {};

    // onInstalled
    created = []; commands = [{ name: "a", shortcut: "Alt+N" }, { name: "b", shortcut: "" }];
    installed({ reason: "update" }); assert.strictEqual(created.length, 0);
    installed({ reason: "install" }); await new Promise((r) => setTimeout(r, 10));
    assert.deepStrictEqual(created, ["chrome-extension://EXT/settings.html#shortcuts"]); console.log("PASS onInstalled opens shortcuts only on install with a missing key");

    // non-palette messages ignored
    assert.strictEqual(listener({ type: "other" }, popup, () => {}), undefined); console.log("PASS non-palette ignored");
    console.log("ALL PASS");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
