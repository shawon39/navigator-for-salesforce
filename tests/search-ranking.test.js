// Search ranking (SFEN_URL.matchScore): exact and prefix label matches beat
// loose letter matches, so "users" finds the Users Setup page first. Also the
// object verbs ("list contacts") and their plural labels.
const path = require("path");
const assert = require("assert");
global.self = global;
global.window = global;
require(path.resolve(__dirname, "../src/shared/sfUrl.js"));
require(path.resolve(__dirname, "../src/shared/setupPages.js"));
const { matchScore } = self.SFEN_URL;
const PAGES = window.SFEN_SETUP_PAGES;

// Rank Setup pages the way the palette does (label + category keywords).
function top(query) {
    return PAGES.map(([label, , category]) => ({ label, sc: matchScore(query, label, `${label} ${category || ""} setup`) }))
        .filter((r) => r.sc >= 0)
        .sort((a, b) => b.sc - a.sc)[0].label;
}

for (const [query, expected] of [
    ["users", "Users"],
    ["perm sets", "Permission Sets"],
    ["profiles", "Profiles"],
    ["legacy profiles", "Legacy Profiles"],
    ["login history", "Login History"],
    ["sandboxes", "Sandboxes"],
    ["apex class", "Apex Classes"],
]) {
    assert.strictEqual(top(query), expected, `"${query}" should rank ${expected} first`);
    console.log(`PASS "${query}" -> ${expected}`);
}

// Verbs match an object's plural label too: "list contacts" finds Contact
// first, not Contact Request.
require(path.resolve(__dirname, "../src/content/commandPalette.data.js"));
const { objectVerbEntries, objectScore } = window.SFEN_CMDK_DATA;
const OBJECTS = [
    { api: "ContactRequest", label: "Contact Request", plural: "Contact Requests" },
    { api: "Contact", label: "Contact", plural: "Contacts" },
    { api: "Account", label: "Account", plural: "Accounts" },
    { api: "Opportunity", label: "Opportunity", plural: "Opportunities" },
    { api: "OpportunityContactRole", label: "Opportunity Contact Role", plural: "Opportunity Contact Roles" },
    { api: "Lead", label: "Lead", plural: "Leads" },
];
for (const [query, expected] of [
    ["contacts", "Contact"],
    ["accounts", "Account"],
    ["opportunities", "Opportunity"],
    ["contact", "Contact"],
]) {
    const first = objectVerbEntries("list", OBJECTS, query)[0];
    assert.strictEqual(first && first.label, expected, `list "${query}" should rank ${expected} first`);
    console.log(`PASS list "${query}" -> ${expected}`);
}

// The "fields" verb picks its object with the same objectScore.
const best = (q) => OBJECTS.reduce((a, o) => (objectScore(q, o) > objectScore(q, a) ? o : a));
for (const [query, expected] of [["contacts", "Contact"], ["leads", "Lead"], ["opportunities", "Opportunity"]]) {
    assert.strictEqual(best(query).api, expected, `objectScore "${query}" should pick ${expected}`);
}
console.log("PASS objectScore picks the object a plural names");

// A field found by its API name, and never by a non-match.
assert(matchScore("tier_level", "Customer Tier", "Tier_Level__c") > 0);
assert.strictEqual(matchScore("zzz", "Customer Tier", "Tier_Level__c"), -1);
console.log("PASS API-name match and no-match");

// Installed packages: an API name's namespace prefix names its package.
const { namespaceOf } = window.SFEN_URL;
for (const [api, ns] of [
    ["SBQQ__Quote__c", "SBQQ"], ["SBQQ__Discount__c", "SBQQ"], ["npe01__OppPayment__c", "npe01"], ["SBQQ__Quote__History", "SBQQ"],
    ["dlrs__LookupRollupSummary2__mdt", "dlrs"], ["Invoice__c", null], ["Article__kav", null], ["Account", null], ["", null],
])
    assert.strictEqual(namespaceOf(api), ns, api);
console.log("PASS namespace prefixes name the package, not the type suffix");

// Package objects rank after the org's own when they match as well.
const PKG = [{ api: "SBQQ__Quote__c", label: "Quote", plural: "Quotes" }, { api: "Quote", label: "Quote", plural: "Quotes" }];
assert.strictEqual(objectVerbEntries("list", PKG, "quote")[0].url, "/lightning/o/Quote/home");
assert.strictEqual(objectVerbEntries("list", PKG, "sbqq")[0].url, "/lightning/o/SBQQ__Quote__c/home"); // still found by prefix
assert.deepStrictEqual(objectVerbEntries("list", PKG, "").map((e) => e.url), ["/lightning/o/Quote/home", "/lightning/o/SBQQ__Quote__c/home"]);
console.log("PASS package objects come after the org's own and stay findable by prefix");

// Apex from a package is left out unless the query names the package.
const { packageQuery, GROUPS: G } = window.SFEN_CMDK_DATA;
const pkgApex = { group: G.APEX, pkg: "dlrs" };
assert.strictEqual(packageQuery(pkgApex, "selector"), null);
assert.strictEqual(packageQuery(pkgApex, "dlrsx selector"), null);
assert.strictEqual(packageQuery(pkgApex, "dlrs selector"), "selector");
assert.strictEqual(packageQuery(pkgApex, "selector dlrs"), "selector");
assert.strictEqual(packageQuery(pkgApex, "dlrs__selector"), "selector");
assert.strictEqual(packageQuery(pkgApex, "dlrs"), "dlrs");
assert.strictEqual(packageQuery({ group: G.APEX, pkg: null }, "selector"), "selector");
assert.strictEqual(packageQuery({ group: G.OBJECT, pkg: "SBQQ" }, "quote"), "quote");
assert(matchScore(packageQuery(pkgApex, "dlrs selector"), "ApexClassesSelector", "ApexClassesSelector dlrs apex class code") >= 0);
console.log("PASS package Apex needs its package name in the query");

// Short verb forms name a verb and never shadow one.
const { VERBS, VERB_SHORT } = window.SFEN_CMDK_DATA;
assert.deepStrictEqual(VERB_SHORT, { f: "fields", lo: "login", li: "list", n: "new", a: "app", o: "org", r: "record" });
for (const [short, verb] of Object.entries(VERB_SHORT)) {
    assert(VERBS[verb], `${short} -> ${verb}`);
    assert(!VERBS[short], `${short} is already a verb`);
}
console.log("PASS short verb forms");

// An object's → actions include its Object Manager pages, shared with the popup.
const { objectActions } = window.SFEN_CMDK_DATA;
const acts = objectActions("Opportunity");
assert.strictEqual(acts.length, 3 + window.SFEN_OBJECT_PAGES.length + 1);
assert(acts.some((a) => a.label === "Validation Rules" && a.url === "/lightning/setup/ObjectManager/Opportunity/ValidationRules/view"));
assert.strictEqual(acts[acts.length - 1].url, "/lightning/setup/ObjectManager/Opportunity/Details/view");
console.log("PASS object actions include Object Manager pages");

// A pasted link opens its page here; another org's record pages don't.
require(path.resolve(__dirname, "../src/shared/orgs.js"));
const { pastedLinkPath } = window.SFEN_CMDK_DATA;
const PROD = "acme.lightning.force.com";
for (const [text, expected] of [
    ["https://acme--uat.sandbox.lightning.force.com/lightning/setup/Profiles/home", "/lightning/setup/Profiles/home"],
    [" https://acme--uat.sandbox.my.salesforce-setup.com/lightning/setup/ObjectManager/Account/ValidationRules/view ", "/lightning/setup/ObjectManager/Account/ValidationRules/view"],
    ["https://acme--uat.sandbox.lightning.force.com/lightning/o/Case/list?filterName=Recent", "/lightning/o/Case/list?filterName=Recent"],
    ["https://acme--uat.sandbox.lightning.force.com/lightning/r/Account/001000000000001AAA/view", null], // another org's record
    ["https://acme.lightning.force.com/lightning/r/Account/001000000000001AAA/view", "/lightning/r/Account/001000000000001AAA/view"], // this org's
    ["https://acme--uat.sandbox.lightning.force.com/lightning/setup/EnhancedProfiles/page?address=%2F00e000000000001", null],
    ["http://acme--uat.sandbox.lightning.force.com/lightning/setup/Profiles/home", null],
    ["https://evil.example.com/lightning/setup/Profiles/home", null],
    ["https://acme.lightning.force.com/", null],
    ["profiles", null],
])
    assert.strictEqual(pastedLinkPath(text, PROD), expected, text);
console.log("PASS pasted links open their page here, except another org's records");

// Results you pick often rank higher, but only among similar matches.
const { pickBonus, addPick } = window.SFEN_CMDK_DATA;
assert.deepStrictEqual([0, 1, 3, 100].map(pickBonus), [0, 12, 24, 40]);
const usersPage = PAGES.find(([label]) => label === "Users")[1];
const userMgmt = PAGES.find(([label]) => label === "User Management Settings");
assert(userMgmt, "User Management Settings is in the Setup list");
const rank = (query, picks) =>
    PAGES.map(([label, url, category]) => ({ label, sc: matchScore(query, label, `${label} ${category || ""} setup`) + pickBonus(picks[url] || 0) }))
        .filter((r) => r.sc >= 0)
        .sort((a, b) => b.sc - a.sc)[0].label;
assert.strictEqual(rank("user", {}), "Users");
assert.strictEqual(rank("user", { [userMgmt[1]]: 2 }), "User Management Settings"); // a prefix match like Users
assert.strictEqual(rank("users", { [userMgmt[1]]: 100 }), "Users"); // an exact match still wins
assert.strictEqual(rank("user", { [userMgmt[1]]: 2, [usersPage]: 3 }), "Users");
// Object verbs: the often-picked object first, by a prefix match or with nothing typed.
const boostList = (url) => pickBonus(url === "/lightning/o/Account/home" ? 2 : 0);
assert.strictEqual(objectVerbEntries("list", OBJECTS, "", boostList)[0].url, "/lightning/o/Account/home");
assert.strictEqual(objectVerbEntries("list", OBJECTS, "contact", boostList)[0].url, "/lightning/o/Contact/home");
console.log("PASS often-picked results rank higher among similar matches");

// Pick counts are kept per org, at most 200 per org, and a new pick is never dropped.
let picks = addPick(undefined, "acme", "/a");
picks = addPick(picks, "acme", "/a");
picks = addPick(picks, "acme--uat.sandbox", "/a");
assert.deepStrictEqual(picks, { acme: { "/a": 2 }, "acme--uat.sandbox": { "/a": 1 } });
let many = {};
for (let i = 0; i < 200; i++) many = addPick(many, "acme", "/p" + i);
many = addPick(many, "acme", "/p0");
many = addPick(many, "acme", "/new");
assert.strictEqual(Object.keys(many.acme).length, 200);
assert.strictEqual(many.acme["/new"], 1);
assert.strictEqual(many.acme["/p0"], 2);
console.log("PASS pick counts are per org and capped");
console.log("ALL PASS");
