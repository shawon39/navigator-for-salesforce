// Search ranking (SFEN_URL.matchScore): exact and prefix label matches beat
// loose letter matches, so "users" finds the Users Setup page first.
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
    ["login history", "Login History"],
    ["apex class", "Apex Classes"],
]) {
    assert.strictEqual(top(query), expected, `"${query}" should rank ${expected} first`);
    console.log(`PASS "${query}" -> ${expected}`);
}

// A field found by its API name, and never by a non-match.
assert(matchScore("tier_level", "Customer Tier", "Tier_Level__c") > 0);
assert.strictEqual(matchScore("zzz", "Customer Tier", "Tier_Level__c"), -1);
console.log("PASS API-name match and no-match");
console.log("ALL PASS");
