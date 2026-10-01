// Input checks shared by the popup, Settings page and content scripts:
// saved org hosts, safe paths and settings from an imported file.
const path = require("path");
const assert = require("assert");
global.self = global;
global.window = global;
require(path.resolve(__dirname, "../src/shared/sfUrl.js"));
require(path.resolve(__dirname, "../src/shared/settings.js"));
const { isOrgHost, isSafePath } = self.SFEN_URL;
const { normalize, DEFAULTS } = window.SFEN_SETTINGS;

// Saved orgs may only point at Salesforce domains.
for (const ok of ["login.salesforce.com", "test.salesforce.com", "acme.my.salesforce.com",
    "acme--uat.sandbox.lightning.force.com", "acme.my.salesforce-setup.com", "acme.my.site.com"])
    assert(isOrgHost(ok), ok);
for (const bad of ["evil.com", "acme-login.evil.example", "salesforce.com.evil.com", "evilsalesforce.com",
    "evil.com/x.force.com", "a@b.force.com", "", null])
    assert(!isOrgHost(bad), String(bad));
console.log("PASS isOrgHost allows only Salesforce domains");

// Paths stay on the org: no "//", "/\" or their encoded forms at the start.
for (const bad of ["//evil.com", "/\\evil.com", "/%2F%2Fevil.com", "/%2fevil.com", "/%5Cevil.com", "javascript:alert(1)", "/a b"])
    assert(!isSafePath(bad), bad);
for (const ok of ["/lightning/setup/Users/home", "/lightning/setup/ObjectManager/page?address=%2F01I000000000001"])
    assert(isSafePath(ok), ok);
console.log("PASS isSafePath blocks encoded slashes at the start only");

// Imported settings: unknown keys dropped, wrong types fall back to defaults.
const s = normalize({ theme: "<b>", confirmDelete: "no", autoClose: false, junk: "x".repeat(9000),
    popupTabs: { orgs: false, recent: "yes", extra: true } });
assert.strictEqual(s.theme, "light");
assert.strictEqual(s.confirmDelete, true);
assert.strictEqual(s.autoClose, false);
assert(!("junk" in s));
assert.deepStrictEqual(s.popupTabs, { recent: true, navigate: true, objects: true, orgs: false });
assert.deepStrictEqual(Object.keys(s).sort(), Object.keys(DEFAULTS).sort());
assert.strictEqual(normalize({ darkMode: true }).theme, "dark");
assert.strictEqual(normalize({ theme: "system" }).theme, "system");
assert.deepStrictEqual(normalize(null), normalize({}));
console.log("PASS normalize keeps only known settings with the right type");
