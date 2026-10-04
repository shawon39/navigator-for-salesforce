// Tab colors by org (src/shared/orgColors.js): the palette stays readable on
// Chrome's tab strips, colors are assigned in a stable order with red kept for
// production, imported colors are checked, and the tab icon is a safe data URL.
const path = require("path");
const assert = require("assert");
global.self = global;
global.window = global;
require(path.resolve(__dirname, "../src/shared/sfUrl.js"));
require(path.resolve(__dirname, "../src/shared/orgs.js"));
require(path.resolve(__dirname, "../src/shared/orgColors.js"));
const C = window.SFEN_ORG_COLORS;

// Chrome's tab and tab-strip backgrounds (active / inactive), light and dark.
const LIGHT_BG = ["#FFFFFF", "#D3E3FD"];
const DARK_BG = ["#3C3C3C", "#1F2020"];

// ---- Palette contrast ----
assert.strictEqual(C.ORDER.length, 12);
for (const name of C.ORDER) {
    const light = C.look(name, false);
    const dark = C.look(name, true);
    for (const bg of LIGHT_BG) assert(C.contrast(light.fill, bg) >= 3, `${name} light vs ${bg}`);
    for (const bg of DARK_BG) assert(dark.ring || C.contrast(dark.fill, bg) >= 3, `${name} dark vs ${bg}`);
    assert(C.contrast(light.fill, light.text) >= 3.5, `${name} light initial`);
    assert(C.contrast(dark.fill, dark.text) >= 3.5, `${name} dark initial`);
}
assert.deepStrictEqual(C.ORDER.filter((n) => C.look(n, true).ring), ["black"]);
assert.strictEqual(C.look("black", true).text, "#FFFFFF");
console.log("PASS every color is readable on light and dark tab strips");

// ---- Assignment ----
const sandbox = (n) => ({ id: "s" + n, host: `acme--s${n}.sandbox.my.salesforce.com`, isSandbox: true });
const prod = (n) => ({ id: "p" + n, host: `prod${n}.my.salesforce.com` });

let colors = C.assign(Array.from({ length: 12 }, (_, i) => sandbox(i)), {});
const first11 = Array.from({ length: 11 }, (_, i) => colors["s" + i]);
assert.deepStrictEqual(first11, C.ORDER.filter((c) => c !== "red"));
assert.strictEqual(colors.s11, "gold"); // least used, palette order breaks the tie
console.log("PASS sandboxes get distinct non-red colors in order, then repeat");

colors = C.assign([sandbox(0), prod(0), prod(1), sandbox(1)], {});
assert.deepStrictEqual([colors.s0, colors.p0, colors.p1, colors.s1], ["gold", "red", "purple", "teal"]);
console.log("PASS the first production org gets red, the next one the next free color");

const twelve = [prod(0)].concat(Array.from({ length: 11 }, (_, i) => sandbox(i)));
colors = C.assign(twelve.concat(sandbox(99)), {});
assert.strictEqual(new Set(twelve.map((o) => colors[o.id])).size, 12);
assert.strictEqual(colors.s99, "gold");
console.log("PASS one production org and 11 sandboxes use all 12 colors");

colors = C.assign([sandbox(0), sandbox(1), sandbox(2)], JSON.parse('{"s1":"red","s2":"#fff","__proto__":"gold","s0":3}'));
assert.deepStrictEqual([colors.s0, colors.s1, colors.s2], ["gold", "red", "purple"]);
colors = C.assign([{ id: "__proto__", host: "a--b.sandbox.my.salesforce.com" }], { toString: "red" });
assert.strictEqual(colors.__proto__, "gold");
assert.deepStrictEqual(C.assign(null, null), Object.create(null));
assert.deepStrictEqual(C.assign([sandbox(0), sandbox(1)], {}), C.assign([sandbox(0), sandbox(1)], {}));
console.log("PASS stored picks win, bad values are ignored, same input gives same output");

// Orgs saved before ids existed are keyed by host.
assert.strictEqual(C.keyOf({ host: "old.my.salesforce.com" }), "old.my.salesforce.com");
assert.strictEqual(C.assign([{ host: "old.my.salesforce.com" }], {})["old.my.salesforce.com"], "red"); // production
console.log("PASS orgs without an id are keyed by host");

// ---- Import cleanup ----
const raw = { a: "gold", b: "#123456", c: "toString", ["k".repeat(256)]: "red", ["h".repeat(85)]: "sky" };
assert.deepStrictEqual(C.clean(raw), { a: "gold", ["h".repeat(85)]: "sky" });
assert.strictEqual(C.clean([]), null);
assert.strictEqual(C.clean("gold"), null);
const many = {};
for (let i = 0; i < 150; i++) many["o" + i] = "teal";
assert.strictEqual(Object.keys(C.clean(many)).length, 100);
console.log("PASS imported colors keep only known names on sane keys");

// ---- Initials ----
const init = (label, host) => C.initial({ label, host: host || "acme.my.salesforce.com" });
assert.strictEqual(init("", "acme--uat.sandbox.my.salesforce.com"), "U"); // "Acme · UAT"
assert.strictEqual(init("dx-org"), "D");
assert.strictEqual(init("Claude org"), "C");
assert.strictEqual(init("42 Prod"), "4");
assert.strictEqual(init("Ünïcode"), "Ü");
assert.strictEqual(init("Acme · —"), "A");
assert.strictEqual(init("—"), "");
console.log("PASS initials come from the org name, after the dot for sandboxes");

// ---- Tab icon ----
const url = C.iconUrl("gold", "Ж", false, false);
assert(url.startsWith("data:image/svg+xml,"));
assert.strictEqual(new URL(url).hash, "", "no raw # in the URL");
const svg = decodeURIComponent(url.slice("data:image/svg+xml,".length));
assert(svg.includes('fill="#895600"') && svg.includes(">Ж</text>"));
assert(!C.iconSvg("black", "B", false, false).includes("#E3E3E3"));
assert(C.iconSvg("black", "B", false, true).includes("#E3E3E3"));
assert(C.iconSvg("red", "P", true, false).includes("<circle"));
assert(!C.iconSvg("red", "P", false, false).includes("<circle"));
assert(!C.iconSvg("gold", '<a">', false, false).includes("<a"));
assert(C.iconSvg("nope", "A", false, false).includes(C.PALETTE.gold.light)); // unknown color falls back
console.log("PASS the tab icon is an escaped SVG data URL with ring and circle only where needed");

// The ring is a centered stroke, so the ringed cloud is shrunk to keep it in the box.
assert(C.iconSvg("black", "B", false, true).includes('transform="matrix(0.97 0 0 0.97 0.48 0.48)"'));
assert(!C.iconSvg("gold", "B", false, true).includes("transform="));
console.log("PASS the ring stays inside the icon");

// Production: the initial in the cloud's color on a circle in the initial's
// color, made smaller for wide initials so no ink falls outside the circle.
const fontSize = (s) => parseFloat(s.match(/font-size="([\d.]+)"/)[1]);
const prodSvg = C.iconSvg("red", "P", true, false);
const red = C.look("red", false);
assert(prodSvg.includes(`<circle cx="16.25" cy="15.25" r="8.4" fill="${red.text}"/>`));
assert(prodSvg.includes(`fill="${red.fill}">P</text>`));
assert.strictEqual(fontSize(prodSvg), 14);
for (const ch of ["Ж", "Æ", "Ю", "東", "한", "SS"]) assert(fontSize(C.iconSvg("red", ch, true, false)) < 14, ch);
assert(fontSize(C.iconSvg("red", "SS", true, false)) < fontSize(C.iconSvg("red", "Ж", true, false)));
assert.strictEqual(fontSize(C.iconSvg("red", "Ж", false, false)), 18); // the cloud has room
assert.strictEqual(C.initial({ label: "ßeta", host: "a.my.salesforce.com" }), "SS");
console.log("PASS the production initial fits its circle");

// Every initial's ink stays inside the cloud's body, or inside the production
// circle. Ink boxes measured in Chrome's bold system font on macOS (em):
// width, height above and below the baseline. The text is centered on x.
const INK = {
    P: [0.53, 0.7, 0], W: [0.92, 0.7, 0], "Ж": [1, 0.7, 0], "Ш": [0.84, 0.7, 0], SS: [1.2, 0.72, 0.01],
    "東": [0.86, 0.77, 0.1], "한": [0.83, 0.81, 0.06], "क": [0.89, 0.62, 0], "ক": [0.85, 0.65, 0],
    "ཀ": [0.71, 0.61, 0.33], "த": [0.69, 0.48, 0.28], "ฎ": [0.56, 0.57, 0.28], "ش": [0.87, 0.77, 0.06],
    "ꦏ": [1.13, 0.56, 0.02],
};
const textAt = (s) => ({ x: parseFloat(s.match(/<text x="([\d.]+)"/)[1]), y: parseFloat(s.match(/<text[^>]* y="([\d.]+)"/)[1]), size: fontSize(s) });
for (const [ch, [w, up, down]] of Object.entries(INK)) {
    const t = textAt(C.iconSvg("teal", ch, false, false));
    const top = t.y - up * t.size;
    const bottom = t.y + down * t.size;
    assert(top >= 7.5 && bottom <= 24 && (w * t.size) / 2 <= 11, `${ch} on the cloud: ${top.toFixed(1)}..${bottom.toFixed(1)}`);
    const p = textAt(C.iconSvg("teal", ch, true, false));
    const corner = (dy) => Math.hypot((w * p.size) / 2, dy);
    const far = Math.max(corner(p.y - up * p.size - 15.25), corner(p.y + down * p.size - 15.25));
    assert(Math.abs(p.x - 16.25) < 0.01 && far <= 8.4, `${ch} in the circle reaches ${far.toFixed(2)}`);
}
assert.strictEqual(fontSize(C.iconSvg("teal", "P", false, false)), 18); // capitals keep the full size
console.log("PASS initials in any script stay inside the cloud and the circle");

// tile() builds the same shapes through the DOM, the initial as text, in a
// box cropped to the cloud (26 of 32 units tall).
function fakeEl(tag) {
    return {
        tag,
        attrs: {},
        style: {},
        children: [],
        textContent: "",
        setAttribute(k, v) {
            this.attrs[k] = String(v);
        },
        appendChild(child) {
            this.children.push(child);
        },
    };
}
global.document = { createElement: fakeEl, createElementNS: (ns, tag) => fakeEl(tag) };
for (const args of [["red", "P", true, false], ["black", "Ж", false, true], ["teal", "", false, false]]) {
    const span = C.tile(...args, 24);
    const svgEl = span.children[0];
    assert.strictEqual(span.className, "nv-org-tile");
    assert.strictEqual(svgEl.attrs.viewBox, "0 3 32 26");
    assert.deepStrictEqual([span.style.width, span.style.height, svgEl.style.width, svgEl.style.height], ["24px", "19.5px", "24px", "19.5px"]);
    const markup = svgEl.children
        .map((el) => {
            const a = Object.keys(el.attrs).map((k) => ` ${k}="${el.attrs[k]}"`).join("");
            return el.textContent ? `<${el.tag}${a}>${el.textContent}</${el.tag}>` : `<${el.tag}${a}/>`;
        })
        .join("");
    assert.strictEqual(markup, C.iconSvg(...args).replace(/^<svg[^>]*>|<\/svg>$/g, ""), args.join(" "));
}
console.log("PASS tile() draws the same icon as the tab");

// The icon files used when a page's CSP blocks data: images are the same
// clouds without the initial. To regenerate after a palette change, write
// C.iconSvg(color, "", prod, dark) + "\n" to each file named below.
const fs = require("fs");
const dir = path.resolve(__dirname, "../images/tab");
const expected = [];
for (const color of C.ORDER)
    for (const prod of [false, true])
        for (const dark of [false, true]) {
            const file = `${color}${prod ? "-prod" : ""}-${dark ? "dark" : "light"}.svg`;
            expected.push(file);
            assert.strictEqual(fs.readFileSync(path.join(dir, file), "utf8"), C.iconSvg(color, "", prod, dark) + "\n", file);
        }
assert.deepStrictEqual(fs.readdirSync(dir).sort(), expected.sort());
console.log(`PASS ${expected.length} fallback icon files match the palette`);

// The default is off.
require(path.resolve(__dirname, "../src/shared/settings.js"));
assert.strictEqual(window.SFEN_SETTINGS.normalize({}).orgTabColors, false);
assert.strictEqual(window.SFEN_SETTINGS.normalize({ orgTabColors: "yes" }).orgTabColors, false);
assert.strictEqual(window.SFEN_SETTINGS.normalize({ orgTabColors: true }).orgTabColors, true);
console.log("PASS tab colors are off by default");
console.log("ALL PASS");
