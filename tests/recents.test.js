// Recent Setup (src/shared/recents.js) keeps each org's history apart: a Flow
// opened in a UAT sandbox must not show up in production, where its version id
// doesn't exist.
const path = require("path");
const assert = require("assert");
global.self = global;
global.window = global;

// Just enough of chrome.storage.local for recents.js.
const store = {};
global.chrome = {
    runtime: { id: "test", lastError: null },
    storage: {
        local: {
            get(defaults, cb) {
                const out = {};
                for (const k of Object.keys(defaults)) out[k] = k in store ? store[k] : defaults[k];
                cb(JSON.parse(JSON.stringify(out)));
            },
            set(items) {
                Object.assign(store, JSON.parse(JSON.stringify(items)));
            },
        },
        onChanged: { addListener() {} },
    },
};

// Saved before entries had an org: dropped on read.
store.paletteRecents = [{ label: "Old", hint: "Flow", url: "/builder_platform_interaction/flowBuilder.app?flowId=301000000000001" }];

require(path.resolve(__dirname, "../src/shared/orgs.js"));
require(path.resolve(__dirname, "../src/shared/recents.js"));
const R = window.SFEN_RECENTS;

const UAT = "acme--uat.sandbox.lightning.force.com";
const PROD = "acme.lightning.force.com";
const load = (host) => new Promise((resolve) => R.load(host, resolve));

(async () => {
    assert.deepStrictEqual(await load(PROD), [], "entries without an org are dropped");
    console.log("PASS entries saved without an org are dropped");

    R.record({ label: "My Flow", hint: "Flow", url: "/builder_platform_interaction/flowBuilder.app?flowId=301UAT000000001" }, UAT);
    R.record({ label: "Flows", hint: "Setup", url: "/lightning/setup/Flows/home" }, PROD);

    assert.deepStrictEqual((await load(UAT)).map((x) => x.label), ["My Flow"]);
    assert.deepStrictEqual((await load(PROD)).map((x) => x.label), ["Flows"]);
    console.log("PASS each org sees only its own entries");

    // The Setup and My Domain hosts of an org are the same org.
    assert.deepStrictEqual((await load("acme--uat.sandbox.my.salesforce-setup.com")).map((x) => x.label), ["My Flow"]);
    assert.deepStrictEqual((await load("acme.my.salesforce.com")).map((x) => x.label), ["Flows"]);
    console.log("PASS Lightning, Setup and My Domain hosts share history");

    // The same page in two orgs is two entries; opening it again moves it up.
    R.record({ label: "Flows", hint: "Setup", url: "/lightning/setup/Flows/home" }, UAT);
    assert.deepStrictEqual((await load(UAT)).map((x) => x.label), ["Flows", "My Flow"]);
    assert.deepStrictEqual((await load(PROD)).map((x) => x.label), ["Flows"]);
    console.log("PASS the same page is kept per org");

    // Ten per org: a busy org doesn't push another org's history out.
    for (let i = 0; i < 15; i++) R.record({ label: "P" + i, hint: "Setup", url: "/lightning/setup/P" + i + "/home" }, PROD);
    const prod = await load(PROD);
    assert.strictEqual(prod.length, 10);
    assert.strictEqual(prod[0].label, "P14");
    assert.deepStrictEqual((await load(UAT)).map((x) => x.label), ["Flows", "My Flow"]);
    console.log("PASS at most 10 entries per org");

    // No org (popup off Salesforce): nothing recorded, nothing shown.
    R.record({ label: "X", hint: "Setup", url: "/lightning/setup/X/home" }, "");
    assert.deepStrictEqual(await load(""), []);
    assert(!store.paletteRecents.some((x) => x.label === "X"));
    console.log("PASS no org, no history");

    assert.deepStrictEqual(R.forOrg(store.paletteRecents, UAT).map((x) => x.label), ["Flows", "My Flow"]);
    console.log("PASS forOrg filters a stored list");

    // Flow entries keep their definition id and follow newer versions.
    const FLOW = "/builder_platform_interaction/flowBuilder.app?flowId=";
    const DEF = "300000000000001AAA";
    R.record({ label: "Lead Routing", hint: "Flow", url: FLOW + "301000000000005AAA", flow: DEF }, UAT);
    let uat = await load(UAT);
    assert.deepStrictEqual(R.flowIds(uat), [DEF]);
    console.log("PASS a Flow entry keeps its definition id");

    // Picked again from search under a newer version: still one entry.
    R.record({ label: "Lead Routing", hint: "Flow", url: FLOW + "301000000000006AAA", flow: DEF }, UAT);
    uat = await load(UAT);
    assert.deepStrictEqual(uat.filter((x) => x.flow === DEF).map((x) => x.url), [FLOW + "301000000000006AAA"]);
    console.log("PASS the same flow under a newer version replaces the old entry");

    const updated = R.updateFlows(UAT, { [DEF]: "301000000000007AAA" });
    assert.strictEqual(updated[0].url, FLOW + "301000000000007AAA");
    assert.strictEqual((await load(UAT))[0].url, FLOW + "301000000000007AAA", "saved, not only returned");
    console.log("PASS updateFlows moves the link to the current version");

    assert.strictEqual(R.updateFlows(UAT, { [DEF]: "301000000000007AAA" }), null);
    assert.strictEqual(R.updateFlows(UAT, { [DEF]: "../evil" }), null);
    assert.strictEqual(R.updateFlows(PROD, { [DEF]: "301000000000008AAA" }), null);
    assert.strictEqual((await load(UAT))[0].url, FLOW + "301000000000007AAA");
    console.log("PASS no change, a bad version id or another org leaves it alone");

    R.record({ label: "Bad", hint: "Flow", url: FLOW + "301000000000009AAA", flow: "' OR 1=1" }, UAT);
    assert.strictEqual((await load(UAT))[0].flow, undefined);
    console.log("PASS a malformed definition id isn't stored");
    console.log("ALL PASS");
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
