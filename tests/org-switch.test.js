// Opening the page you're on in another saved org (palette "org" verb and the
// popup's Orgs tab): the URL goes to the org's My Domain host, keeps the path
// and query, and never leaves Salesforce.
const path = require("path");
const assert = require("assert");
global.self = global;
global.window = global;
require(path.resolve(__dirname, "../src/shared/sfUrl.js"));
require(path.resolve(__dirname, "../src/shared/orgs.js"));
const { samePageUrl, myDomainHost } = window.SFEN_ORGS;

const page = "https://acme.lightning.force.com/lightning/setup/ObjectManager/Account/FieldsAndRelationships/view?x=1#top";
const there = (host, href) => samePageUrl({ host }, href || page);
const PATH = "/lightning/setup/ObjectManager/Account/FieldsAndRelationships/view?x=1";

// Every host of an org maps to its My Domain, which redirects to the right
// domain (and keeps the path through login).
for (const [host, my] of [
    ["acme--uat.sandbox.lightning.force.com", "acme--uat.sandbox.my.salesforce.com"],
    ["acme--uat.sandbox.my.salesforce.com", "acme--uat.sandbox.my.salesforce.com"],
    ["ACME.my.salesforce-setup.com", "acme.my.salesforce.com"],
    ["acme--c.vf.force.com", "acme.my.salesforce.com"],
    ["acme--dev--c.sandbox.vf.force.com", "acme--dev.sandbox.my.salesforce.com"],
    ["orgfarm-3f9a-dev-ed.develop.lightning.force.com", "orgfarm-3f9a-dev-ed.develop.my.salesforce.com"],
    ["dx.scratch.my.salesforce.com", "dx.scratch.my.salesforce.com"],
]) {
    assert.strictEqual(myDomainHost(host), my, host);
    assert.strictEqual(there(host), "https://" + my + PATH, host);
}
console.log("PASS org hosts map to their My Domain with the same path and query");

// Generic login hosts carry the path as startURL.
assert.strictEqual(there("login.salesforce.com"), "https://login.salesforce.com/?startURL=" + encodeURIComponent(PATH));
assert.strictEqual(there("test.salesforce.com"), "https://test.salesforce.com/?startURL=" + encodeURIComponent(PATH));
console.log("PASS login.salesforce.com and test.salesforce.com use startURL");

// Sites, look-alikes and unsafe paths give nothing.
for (const host of ["acme.my.site.com", "evil.com", "acme.my.salesforce.com.evil.com", "", null]) assert.strictEqual(there(host), null, String(host));
for (const href of ["https://acme.lightning.force.com//evil.com/x", "https://acme.lightning.force.com/%2F%2Fevil.com", "not a url"])
    assert.strictEqual(there("acme.my.salesforce.com", href), null, href);
assert.strictEqual(samePageUrl(null, page), null);
console.log("PASS sites, other domains and unsafe paths are refused");

// Pages about one record have no "same page" in another org: a record Id in
// the path or the query (also URL-encoded, as in Setup's ?address=%2F<Id>).
for (const href of [
    "https://acme.lightning.force.com/lightning/r/Account/0015e00000ABCDEAA5/view",
    "https://acme.lightning.force.com/lightning/r/0015e00000ABCDE/view",
    "https://acme.lightning.force.com/lightning/setup/EnhancedProfiles/page?address=%2F00e5e000000AbCd",
    "https://acme.lightning.force.com/lightning/o/Account/list?filterName=00B5e00000AbCdE",
    "https://acme.lightning.force.com/lightning/setup/ObjectManager/01I5e000000AbCd/Details/view",
])
    assert.strictEqual(there("acme--uat.sandbox.my.salesforce.com", href), null, href);
// Object and page names of 15 or 18 letters aren't Ids, nor are 18 characters with a wrong checksum.
for (const path of [
    "/lightning/setup/ObjectManager/ServiceAppointment/Details/view",
    "/lightning/setup/ObjectManager/ContentDocument/FieldsAndRelationships/view",
    "/lightning/o/Account/list?filterName=AllAccounts",
    "/lightning/r/Account/0015e00000ABCDEAAA/view",
])
    assert.strictEqual(there("acme.my.salesforce.com", "https://x.lightning.force.com" + path), "https://acme.my.salesforce.com" + path, path);
console.log("PASS pages about one record get no same-page link; object names still do");

// Hosts compare without case: an org saved as "Acme.my.salesforce.com"
// matches its tabs, so it isn't offered or saved twice.
const { shortHost } = window.SFEN_ORGS;
assert.strictEqual(shortHost("Acme--UAT.Sandbox.My.Salesforce.com"), "acme--uat.sandbox");
assert.strictEqual(shortHost("ACME--c.vf.force.com"), "acme");
assert.strictEqual(shortHost("Acme.my.salesforce.com"), shortHost("acme.lightning.force.com"));
console.log("PASS short hosts are lowercase");
console.log("ALL PASS");
