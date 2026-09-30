// Static checks: every JS file parses, manifest.json is valid, and every file
// the manifest and HTML pages point to exists.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        const p = path.join(dir, d.name);
        return d.isDirectory() ? walk(p) : [p];
    });
}

const js = walk(path.join(ROOT, "src")).filter((f) => f.endsWith(".js"));
js.forEach((f) => execFileSync(process.execPath, ["--check", f]));
console.log(`PASS ${js.length} JS files parse`);

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
assert.strictEqual(manifest.manifest_version, 3);
assert(manifest.name.length <= 75, "name must be at most 75 characters");
assert(manifest.description.length <= 132, "description must be at most 132 characters");
const suggested = Object.values(manifest.commands || {}).filter((c) => c.suggested_key);
assert(suggested.length <= 4, "Chrome allows at most 4 suggested shortcuts");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
assert.strictEqual(pkg.version, manifest.version, "package.json and manifest.json versions differ");
console.log("PASS manifest.json is valid");

const referenced = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_page,
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap((c) => [...(c.js || []), ...(c.css || [])]),
];
for (const page of ["popup.html", "settings.html"]) {
    const html = fs.readFileSync(path.join(ROOT, page), "utf8");
    for (const m of html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|png))"/g)) referenced.push(m[1]);
}
const missing = referenced.map((p) => p.replace(/^\//, "")).filter((p) => !fs.existsSync(path.join(ROOT, p)));
assert.deepStrictEqual(missing, [], "missing files: " + missing.join(", "));
console.log(`PASS ${referenced.length} referenced files exist`);
console.log("ALL PASS");
