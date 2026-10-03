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
console.log("ALL PASS");
