// Background worker: "Home" resolves the current app (UserAppInfo) and falls
// back to /lightning/page/home on errors, timeouts or when live access is off.
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const ROOT = require("path").resolve(__dirname, "..");

let mode = { app: null }; let fetchCalls = [], created = [], storage = {}, commands = [];
let listener, installed, cookies = [];
const ctx = {
    console, URL, Set, Promise, Date, encodeURIComponent,
    fetch: async (url) => {
        fetchCalls.push(url);
        if (url.includes("userinfo")) return { ok: true, status: 200, json: async () => ({ organization_id: "00D000000000001", user_id: "005000000000001AAA" }) };
        if (url.includes("expired")) return { ok: false, status: 401, json: async () => [] };
        if (url.includes("UserAppInfo")) return mode.app(url);
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
        tabs: { create: async (o) => created.push(o.url), query: async () => [{ id: 7, url: "https://acme.lightning.force.com/lightning/r/Account/001/view" }], update: async (id, o) => created.push(o.url) },
        windows: { create: async (o) => created.push(o.url) },
        commands: { onCommand: { addListener: (f) => (ctx.__cmd = f) }, getAll: (cb) => cb(commands) },
    },
};
ctx.self = ctx; ctx.setTimeout = setTimeout;
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
    const T = tab("https://acme.lightning.force.com/lightning/page/home");
    const ok = (json) => async () => ({ ok: true, status: 200, json: async () => json });
    let r;
    mode.app = ok({ records: [{ AppDefinitionId: "06m0N000000Ma7GQAS" }] });
    fetchCalls = [];
    r = await send({ type: "palette", action: "appHome", host: "acme.my.salesforce.com" }, T);
    assert.deepStrictEqual([r.ok, r.path], [true, "/lightning/app/06m0N000000Ma7GQAS"]);
    const q = decodeURIComponent(fetchCalls.find((u) => u.includes("UserAppInfo")));
    assert(q.includes("UserId = '005000000000001AAA'") && q.includes("FormFactor = 'Large'"));
    console.log("PASS current app resolved:", r.path);

    mode.app = ok({ records: [] });
    r = await send({ type: "palette", action: "appHome", host: "acme.my.salesforce.com" }, T);
    assert.strictEqual(r.path, "/lightning/page/home"); console.log("PASS no app → Home");

    mode.app = ok({ records: [{ AppDefinitionId: "../evil" }] });
    r = await send({ type: "palette", action: "appHome", host: "acme.my.salesforce.com" }, T);
    assert.strictEqual(r.path, "/lightning/page/home"); console.log("PASS bad id → Home");

    mode.app = async () => ({ ok: false, status: 500, json: async () => ({}) });
    r = await send({ type: "palette", action: "appHome", host: "acme.my.salesforce.com" }, T);
    assert.strictEqual(r.path, "/lightning/page/home"); console.log("PASS API error → Home");

    mode.app = () => new Promise(() => {});
    const t0 = Date.now();
    r = await new Promise((res) => { listener({ type: "palette", action: "appHome", host: "acme.my.salesforce.com" }, T, res); });
    assert.strictEqual(r.path, "/lightning/page/home"); assert(Date.now() - t0 < 2600);
    console.log("PASS slow org → Home after", Date.now() - t0, "ms");

    storage = { settings: { liveOrgAccess: false } }; fetchCalls = [];
    mode.app = ok({ records: [{ AppDefinitionId: "06m0N000000Ma7GQAS" }] });
    r = await send({ type: "palette", action: "appHome", host: "acme.my.salesforce.com" }, T);
    assert.deepStrictEqual([r.path, fetchCalls.length], ["/lightning/page/home", 0]); console.log("PASS live access off → Home, no API call");
    storage = {};

    created = [];
    ctx.__cmd("navigate_to_home");
    await new Promise((res) => setTimeout(res, 100));
    assert.deepStrictEqual(created, ["https://acme.lightning.force.com/lightning/app/06m0N000000Ma7GQAS"]); console.log("PASS ⌥L/Alt+H uses app home");
    console.log("ALL PASS");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
