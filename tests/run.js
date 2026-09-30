// Runs every *.test.js file in this folder; exits non-zero if any fails.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith(".test.js")).sort();
let failed = 0;
for (const f of files) {
    const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: "utf8" });
    const ok = r.status === 0;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${f}`);
    if (!ok) console.log(r.stdout + r.stderr);
}
console.log(`\n${files.length - failed}/${files.length} test files passed`);
process.exit(failed ? 1 : 0);
