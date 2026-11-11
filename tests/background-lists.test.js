// Background worker: the org lists the palette loads on every page ("objects",
// "admin", "apex", "apps", "tabs"). A copy is kept per org in storage.session
// and answers the next page at once; `fresh` asks the org. A copy belongs to
// one session (by a hash, never the sid), is dropped when live access turns
// off, and a full storage never fails the request. "objects" sends only the
// objects worth listing, with only the fields the palette and popup read.
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const ROOT = require("path").resolve(__dirname, "..");

let fetchCalls = [], sync = {}, session = {}, token = "SID-A", setFails = 0;
let listener, onChanged;
const json = (d) => ({ ok: true, status: 200, json: async () => d });
let objects = [];
const route = (url) => {
    if (url.includes("/sobjects/")) return json({ sobjects: objects });
    if (url.includes("/nav-items")) return json({ navItems: [] });
    return json({ records: [] });
};
const ctx = {
    console, URL, Set, Promise, Date, encodeURIComponent, crypto: globalThis.crypto, TextEncoder,
    fetch: async (url) => {
        fetchCalls.push(url);
        return route(url);
    },
    importScripts: (p) => vm.runInContext(fs.readFileSync(ROOT + p, "utf8"), ctx),
    addEventListener() {},
    chrome: {
        runtime: { id: "EXT", onMessage: { addListener: (f) => (listener = f) }, onInstalled: { addListener() {} }, getURL: (p) => p },
        cookies: { get: async () => ({ value: token }), getAll: async () => [] },
        storage: {
            sync: { get: async () => sync },
            session: {
                get: async (k) => (k === null ? { ...session } : k in session ? { [k]: session[k] } : {}),
                set: async (o) => {
                    if (setFails > 0) {
                        setFails--;
                        throw new Error("Session storage quota bytes exceeded");
                    }
                    Object.assign(session, JSON.parse(JSON.stringify(o)));
                },
                remove: async (keys) => [].concat(keys).forEach((k) => delete session[k]),
                clear: async () => (session = {}),
            },
            onChanged: { addListener: (f) => (onChanged = f) },
        },
        tabs: { create: async () => {}, query: async () => [], update: async () => {} },
        windows: { create: async () => {} },
        commands: { onCommand: { addListener() {} }, getAll: (cb) => cb([]) },
    },
};
ctx.self = ctx; ctx.setTimeout = setTimeout;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + "/src/background/background.js", "utf8"), ctx);

const PAGE = { id: "EXT", tab: { url: "https://acme.lightning.force.com/lightning/page/home" } };
const POPUP = { id: "EXT" };
// Resolves after the worker has kept the copy (it answers first, then stores).
const send = (msg, sender = PAGE) =>
    new Promise((resolve) =>
        listener({ type: "palette", host: "acme.my.salesforce.com", ...msg }, sender, (x) => setTimeout(() => resolve(JSON.parse(JSON.stringify(x))), 0))
    );
const KEY = "orgList objects acme.my.salesforce.com";

(async () => {
    const urls = { sobject: "/services/data/v60.0/sobjects/Account", describe: "/x" };
    const obj = (name, extra) => ({
        name, label: name, labelPlural: name + "s", keyPrefix: "a01", queryable: true, layoutable: true,
        deprecatedAndHidden: false, createable: true, custom: false, urls, ...extra,
    });
    objects = [
        obj("Account", { keyPrefix: "001" }),
        obj("AccountShare"), // system object
        obj("AccountChangeEvent"),
        obj("Old__c", { deprecatedAndHidden: true }),
        obj("NoPrefix__c", { keyPrefix: null }),
        obj("NotLayoutable__c", { layoutable: false }),
        obj("NotQueryable__c", { queryable: false }),
        obj("Invoice__c", { label: "Invoice", labelPlural: "Invoices", custom: true }),
    ];
    fetchCalls = [];
    let r = await send({ action: "objects" });
    assert.deepStrictEqual(r, {
        ok: true,
        sobjects: [
            { name: "Account", label: "Account", labelPlural: "Accounts", keyPrefix: "001" },
            { name: "Invoice__c", label: "Invoice", labelPlural: "Invoices", keyPrefix: "a01" },
        ],
    });
    assert.strictEqual(fetchCalls.length, 1);
    console.log("PASS objects: only listable objects, only name, label, labelPlural and keyPrefix");

    // The next page gets the kept copy at once, without asking the org.
    fetchCalls = [];
    r = await send({ action: "objects" });
    assert.deepStrictEqual([r.cached, r.sobjects.map((s) => s.name), fetchCalls.length], [true, ["Account", "Invoice__c"], 0]);
    // The Setup domain is the same org, so it gets the same copy.
    r = await send({ action: "objects", host: "acme.my.salesforce-setup.com" }, { id: "EXT", tab: { url: "https://acme.my.salesforce-setup.com/lightning/setup/SetupOneHome/home" } });
    assert.deepStrictEqual([r.cached, fetchCalls.length], [true, 0]);
    console.log("PASS a kept list answers the next page with no request");

    // fresh: the org's list now, which then replaces the copy.
    objects.push(obj("Shipment__c"));
    r = await send({ action: "objects", fresh: true });
    assert.deepStrictEqual([r.cached, r.sobjects.length, fetchCalls.length], [undefined, 3, 1]);
    r = await send({ action: "objects" });
    assert.deepStrictEqual([r.cached, r.sobjects.length], [true, 3]);
    console.log("PASS fresh asks the org and updates the copy");

    // The copy names its session by a hash, never the sid itself.
    assert.deepStrictEqual(Object.keys(session), [KEY]);
    assert(!JSON.stringify(session).includes("SID-A"));
    assert.match(session[KEY].who, /^[0-9a-f]{64}$/);
    console.log("PASS the kept copy holds a hash of the session, not the sid");

    // Another user (a re-login, Log in as) never gets the first user's list.
    token = "SID-B";
    objects = [obj("Account", { keyPrefix: "001" })];
    fetchCalls = [];
    r = await send({ action: "objects" });
    assert.deepStrictEqual([r.cached, r.sobjects.length, fetchCalls.length], [undefined, 1, 1]);
    r = await send({ action: "objects" });
    assert.deepStrictEqual([r.cached, r.sobjects.length], [true, 1]);
    console.log("PASS another session's ask goes to the org, not to the copy");

    // Every list is kept on its own, per org.
    for (const action of ["admin", "apex", "apps", "tabs"]) {
        fetchCalls = [];
        r = await send({ action });
        assert.deepStrictEqual([r.ok, r.cached], [true, undefined], action);
        assert(fetchCalls.length > 0, action);
        fetchCalls = [];
        r = await send({ action });
        assert.deepStrictEqual([r.ok, r.cached, fetchCalls.length], [true, true, 0], action);
    }
    assert.deepStrictEqual(Object.keys(session).sort(), ["admin", "apex", "apps", "objects", "tabs"].map((a) => `orgList ${a} acme.my.salesforce.com`));
    console.log("PASS admin, apex, apps and tabs are kept apart, each answering the next page at once");

    // Storage full: drop the other orgs' lists and keep this one.
    r = await send({ action: "objects", host: "other.my.salesforce.com" }, POPUP);
    assert("orgList objects other.my.salesforce.com" in session);
    setFails = 1;
    r = await send({ action: "tabs", fresh: true });
    assert.strictEqual(r.ok, true);
    assert(!("orgList objects other.my.salesforce.com" in session));
    assert("orgList objects acme.my.salesforce.com" in session);
    assert("orgList tabs acme.my.salesforce.com" in session);
    // Still full: answer anyway, and drop the out-of-date copy.
    setFails = 2;
    objects.push(obj("Invoice__c"));
    r = await send({ action: "objects", fresh: true });
    assert.deepStrictEqual([r.ok, r.sobjects.length], [true, 2]);
    assert(!(KEY in session));
    fetchCalls = [];
    r = await send({ action: "objects" });
    assert.deepStrictEqual([r.cached, r.sobjects.length, fetchCalls.length], [undefined, 2, 1]);
    console.log("PASS a full storage drops other orgs' lists, and never fails the request");

    // Live access off: the copies go at once, and nothing answers from them.
    sync = { settings: { liveOrgAccess: false } };
    fetchCalls = [];
    r = await send({ action: "objects" });
    assert.deepStrictEqual([r.ok, r.error, fetchCalls.length], [false, "Live org access is off", 0]);
    onChanged({ settings: { newValue: { liveOrgAccess: true } } }, "sync");
    await new Promise((res) => setTimeout(res, 0));
    assert(Object.keys(session).length > 0);
    onChanged({ settings: { newValue: { liveOrgAccess: false } } }, "sync");
    await new Promise((res) => setTimeout(res, 0));
    assert.deepStrictEqual(session, {});
    console.log("PASS live access off refuses the lists and clears the kept copies");
    console.log("ALL PASS");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
