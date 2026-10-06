// The popup's Orgs tab (src/popup/logins.js) offers the active tab's org when
// tab colors are on and it isn't saved: it's the org found in the browser for
// that tab, saved under its Lightning host, and only offered while it can be
// saved. Runs logins.js with a stubbed chrome and no list to draw into.
const path = require("path");
const assert = require("assert");
global.self = global;
global.window = global;
for (const f of ["sfUrl.js", "settings.js", "orgs.js", "orgColors.js"]) require(path.resolve(__dirname, "../src/shared/" + f));

let store = {};
let found = [];
global.SFEN_UI = { icon: () => "", toast: () => {}, confirmInline: () => {} };
global.document = { getElementById: () => null, documentElement: { classList: { contains: () => false } } };
global.chrome = {
    runtime: { lastError: undefined, sendMessage: (msg, cb) => setTimeout(() => cb({ ok: true, orgs: found })) },
    storage: {
        onChanged: { addListener() {} },
        sync: {
            get(defaults, cb) {
                const out = {};
                Object.keys(defaults).forEach((k) => (out[k] = k in store ? store[k] : defaults[k]));
                setTimeout(() => cb(out));
            },
        },
    },
};
require(path.resolve(__dirname, "../src/popup/logins.js"));
const tab = window.SFEN_ORGS_TAB;

// Orgs the background finds from the browser's session cookies ("orgs" action).
const org = (sub) => ({
    apiHost: sub + ".my.salesforce.com",
    lightningHost: sub + ".lightning.force.com",
    isSandbox: /\.sandbox$/.test(sub) || sub.includes("--"),
});
const ON = { orgTabColors: true };
const saved = (host) => ({ id: host, label: "", host, isSandbox: false, pinned: false });

async function offered({ host, settings = ON, quickOrgs = [], orgs = [org("orgfarm-1-dev-ed.develop"), org("acme--uat.sandbox")], off }) {
    store = { settings, quickOrgs };
    found = orgs;
    await window.initQuickLogin(off ? { offSalesforce: true } : { currentHost: host });
    await new Promise((r) => setTimeout(r, 5)); // the browser's orgs load after the list
    return tab.offered();
}

(async () => {
    assert.deepStrictEqual(await offered({ host: "orgfarm-1-dev-ed.develop.lightning.force.com" }), {
        host: "orgfarm-1-dev-ed.develop.lightning.force.com",
        isSandbox: false,
    });
    // Setup and Visualforce pages offer the same org, under its Lightning host.
    for (const host of ["acme--uat.sandbox.my.salesforce-setup.com", "acme--uat--c.sandbox.vf.force.com"])
        assert.deepStrictEqual(await offered({ host }), { host: "acme--uat.sandbox.lightning.force.com", isSandbox: true }, host);
    console.log("PASS the active tab's org is offered under its Lightning host");

    const host = "orgfarm-1-dev-ed.develop.lightning.force.com";
    assert.strictEqual(await offered({ host, settings: { orgTabColors: false } }), null);
    assert.strictEqual(await offered({ host, quickOrgs: [saved("Orgfarm-1-Dev-Ed.Develop.My.Salesforce.com")] }), null);
    assert.strictEqual(await offered({ host, orgs: [] }), null); // no session in this browser
    assert.strictEqual(await offered({ host: "other.lightning.force.com" }), null);
    assert.strictEqual(await offered({ off: true }), null);
    const full = Array.from({ length: 50 }, (_, i) => saved(`org${i}.my.salesforce.com`));
    assert.strictEqual(await offered({ host, quickOrgs: full }), null);
    assert.notStrictEqual(await offered({ host, quickOrgs: full.slice(1) }), null);
    console.log("PASS not offered with colors off, once saved in any case, without a session, off Salesforce or at 50 orgs");

    await offered({ host });
    tab.filter("acme");
    assert.strictEqual(tab.offered(), null);
    tab.filter("");
    assert.notStrictEqual(tab.offered(), null);
    console.log("PASS not offered while searching the list");
    console.log("ALL PASS");
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
