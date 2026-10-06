// orgColors.js
// Tab colors by org (Settings → Orgs, off by default). Each saved org gets a
// color from a fixed palette, and its tab icon becomes a Salesforce cloud in
// that color with the org's initial. Colors live in chrome.storage.sync "orgColors"
// ({ [org.id || org.host]: "purple" }), apart from "quickOrgs", which is close
// to the 8 KB per-item limit. Used by orgFavicon.js, the popup, the palette,
// the Settings page and tests.
(function (root) {
    "use strict";

    // Assignment order: the first colors are the most different from each
    // other, also for color-blind users. Each color has a shade for Chrome's
    // light tab strip and one for the dark tab strip, both at least 3:1
    // against it (black gets a light ring on dark instead).
    const PALETTE = {
        gold: { label: "Gold", light: "#895600", dark: "#F4C43B" },
        purple: { label: "Purple", light: "#5B00A8", dark: "#A96EF5" },
        teal: { label: "Teal", light: "#008681", dark: "#45EED8" },
        black: { label: "Black", light: "#000000", dark: "#000000" },
        blue: { label: "Blue", light: "#0062F8", dark: "#90B9F8" },
        pink: { label: "Pink", light: "#B30066", dark: "#F870BC" },
        green: { label: "Green", light: "#2B7440", dark: "#39D074" },
        red: { label: "Red", light: "#DF002D", dark: "#EC5A58" },
        grey: { label: "Grey", light: "#3D4044", dark: "#929292" },
        brown: { label: "Brown", light: "#512D1D", dark: "#B89376" },
        orange: { label: "Orange", light: "#DD5400", dark: "#EA8241" },
        sky: { label: "Sky", light: "#005C84", dark: "#80D4FA" },
    };
    const ORDER = Object.keys(PALETTE);
    const PROD_COLOR = "red";
    const RING = "#E3E3E3";
    const WHITE = "#FFFFFF";
    const INK = "#1F1F1F";

    // Own keys only, so "__proto__" or "toString" from an imported file never count.
    const isColor = (v) => typeof v === "string" && Object.prototype.hasOwnProperty.call(PALETTE, v);
    const keyOf = (org) => String((org && (org.id || org.host)) || "");
    const isProduction = (org) => root.SFEN_ORGS.orgType(org) === "production";

    // Color name per saved org key. Stored picks win; the rest are filled in
    // list order: a production org gets red if it's free, everything else the
    // least-used color (ties in palette order). Red is never given to a
    // non-production org automatically. Same input, same output.
    function assign(orgs, stored) {
        const out = Object.create(null);
        const used = Object.create(null);
        ORDER.forEach((c) => (used[c] = 0));
        const list = (Array.isArray(orgs) ? orgs : []).filter((o) => o && keyOf(o));
        const saved = stored && typeof stored === "object" ? stored : {};
        list.forEach((o) => {
            const k = keyOf(o);
            const c = Object.prototype.hasOwnProperty.call(saved, k) ? saved[k] : null;
            if (isColor(c) && !(k in out)) {
                out[k] = c;
                used[c]++;
            }
        });
        list.forEach((o) => {
            const k = keyOf(o);
            if (k in out) return;
            let pick = isProduction(o) && used[PROD_COLOR] === 0 ? PROD_COLOR : null;
            if (!pick) {
                ORDER.forEach((c) => {
                    if (c !== PROD_COLOR && (pick === null || used[c] < used[pick])) pick = c;
                });
            }
            out[k] = pick;
            used[pick]++;
        });
        return out;
    }

    // Colors kept from an imported file: own keys of 1-255 characters with a
    // known color name, at most 100. Returns null for anything but an object.
    function clean(raw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const out = {};
        Object.keys(raw)
            .filter((k) => k.length > 0 && k.length <= 255 && isColor(raw[k]))
            .slice(0, 100)
            .forEach((k) => (out[k] = raw[k]));
        return out;
    }

    // Colors for `orgs` after importing a file: the file's color where it has
    // one (by key, or by host for orgs saved before ids, which get a new id on
    // import), else the color the org has now. null when the file has no
    // colors (an older export, or one made before tab colors were turned on,
    // which has an empty map), so the current colors are left as they are.
    function merge(orgs, fileColors, now) {
        const file = clean(fileColors) || {};
        if (!Object.keys(file).length) return null;
        const kept = clean(now) || {};
        const out = {};
        (Array.isArray(orgs) ? orgs : []).forEach((o) => {
            const key = keyOf(o);
            const c = key && (file[key] || file[o.host] || kept[key]);
            if (c) out[key] = c;
        });
        return out;
    }

    // The org's initial: the first letter or digit of its name, or of the part
    // after "·" ("Acme · UAT" -> "U"), so an org's sandboxes don't all show "A".
    function initial(org) {
        const name = root.SFEN_ORGS.displayName(org);
        const part = name.includes("·") ? name.slice(name.lastIndexOf("·") + 1) : name;
        const m = part.match(/[\p{L}\p{N}]/u) || name.match(/[\p{L}\p{N}]/u);
        return m ? m[0].toUpperCase() : "";
    }

    function luminance(hex) {
        const c = [1, 3, 5]
            .map((i) => parseInt(hex.substr(i, 2), 16) / 255)
            .map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }

    function contrast(a, b) {
        const x = luminance(a);
        const y = luminance(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    }

    // Color of the initial on the cloud, and of the circle behind it for
    // production (where the initial takes the cloud's color instead). 3.5:1
    // keeps the small initial readable; white is preferred so the light-mode
    // icons look alike.
    function textColor(fill) {
        return contrast(fill, WHITE) >= 3.5 ? WHITE : INK;
    }

    // Everything needed to draw one icon. dark: Chrome's tab strip is dark.
    function look(color, dark) {
        const p = PALETTE[isColor(color) ? color : ORDER[0]];
        const fill = dark ? p.dark : p.light;
        return { fill, text: textColor(fill), ring: dark && contrast(fill, "#3C3C3C") < 3 };
    }

    // The Salesforce cloud, the shape of Salesforce's own tab icon, 31 units
    // wide in a 32-unit box. It's 12% taller than Salesforce's, so the initial
    // can be bigger in Chrome's 16 px tab icon; more starts to look like a
    // generic cloud.
    const CLOUD =
        "M13.42 6.47A5.42 6.07 0 0 1 17.36 4.59C19.37 4.59 21.17 5.89 22.12 7.78C22.94 7.34 23.87 7.12 24.84 7.12" +
        "C28.52 7.12 31.5 10.51 31.5 14.68C31.5 18.84 28.52 22.23 24.81 22.23C24.37 22.23 23.92 22.16 23.5 22.08" +
        "A4.84 5.42 0 0 1 19.23 24.89C18.46 24.89 17.74 24.68 17.1 24.36A5.57 6.24 0 0 1 11.97 28.15" +
        "A5.56 6.23 0 0 1 6.74 24.08C6.39 24.16 6.04 24.19 5.67 24.19C2.83 24.19 0.5 21.58 0.5 18.32" +
        "C0.5 16.16 1.55 14.26 3.1 13.24C2.77 12.42 2.59 11.51 2.59 10.58C2.59 6.84 5.31 3.85 8.6 3.85" +
        "C10.58 3.85 12.28 4.87 13.4 6.46Z";
    // The middle of the cloud's body, a little left of and above the box's.
    const MID = { x: 15.5, y: 15.5 };
    // The production circle sits where the cloud has the most room, so it
    // stays inside the dip between the top two bumps.
    const DISC = { x: 16.25, y: 15.25, r: 8.4 };
    const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
    // The ring is a stroke centered on the cloud's edge; shrinking the cloud 3%
    // keeps its outer half inside the 32-unit box.
    const RING_FIT = "matrix(0.97 0 0 0.97 0.48 0.48)";
    // Capitals wider than most (0.8 em) with ink in their corners.
    const WIDE = /^[ÆŒĲǄǇǊǱЖШЩЮ]$/u;
    const CAPS = /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Armenian}\p{N}]$/u;
    const FULL_WIDTH = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

    // The initial's ink box in em, measured in the system fonts: width, and
    // height above and below the baseline. Capitals sit on the baseline at
    // 0.7 em; two letters come from initials like ß -> SS. Han, kana and
    // Hangul fill a taller square. Other scripts (Devanagari, Thai, Arabic,
    // Tibetan...) vary and some hang below the baseline, so they get a box
    // that fits them all.
    function inkBox(ch) {
        if ([...ch].length > 1) return { w: 1.22, up: 0.7, down: 0 };
        if (WIDE.test(ch)) return { w: 1, up: 0.7, down: 0 };
        if (CAPS.test(ch)) return { w: 0.8, up: 0.7, down: 0 };
        if (FULL_WIDTH.test(ch)) return { w: 0.88, up: 0.82, down: 0.1 };
        return { w: 0.9, up: 0.8, down: 0.3 };
    }

    // Font size of the initial: up to 18 on the cloud, within the room its
    // body has (22 wide, 16 tall); up to 14 in the production circle, with
    // the box's corners inside it, since ink outside the circle is in the
    // cloud's color and would vanish.
    function fontSize(box, prod) {
        const size = prod
            ? Math.min(14, (DISC.r - 0.4) / Math.hypot(box.w / 2, (box.up + box.down) / 2))
            : Math.min(18, 22 / box.w, 16 / (box.up + box.down));
        return Math.floor(size * 10) / 10;
    }

    // The icon as [tag, attributes, text] items, for iconSvg() and tile(): the
    // cloud, the initial, a light ring for black on a dark tab strip, and for
    // production the initial in a circle (an inner outline left the initial
    // too small to read at 16 px). letter is one character from initial(), so
    // it can't carry markup; markup characters are dropped anyway.
    function shapes(color, letter, prod, dark) {
        const t = look(color, dark);
        const ch = String(letter || "").slice(0, 2).replace(/[&<>"']/g, "");
        const at = prod ? DISC : MID;
        const box = inkBox(ch);
        const size = fontSize(box, prod);
        // Baseline from the ink box, so the ink is centered whatever the
        // font's ascent and descent.
        const y = Math.round((at.y + ((box.up - box.down) / 2) * size) * 100) / 100;
        const cloud = { d: CLOUD, fill: t.fill };
        if (t.ring) Object.assign(cloud, { stroke: RING, "stroke-width": "1.5", transform: RING_FIT });
        const out = [["path", cloud]];
        if (prod) out.push(["circle", { cx: DISC.x, cy: DISC.y, r: DISC.r, fill: t.text }]);
        if (ch) {
            const fill = prod ? t.fill : t.text;
            out.push(["text", { x: at.x, y, "text-anchor": "middle", "font-family": FONT, "font-weight": "700", "font-size": size, fill }, ch]);
        }
        return out;
    }

    // The tab icon as SVG markup.
    function iconSvg(color, letter, prod, dark) {
        const body = shapes(color, letter, prod, dark).map(([tag, attrs, text]) => {
            const a = Object.keys(attrs).map((k) => ` ${k}="${attrs[k]}"`).join("");
            return text ? `<${tag}${a}>${text}</${tag}>` : `<${tag}${a}/>`;
        });
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' + body.join("") + "</svg>";
    }

    // encodeURIComponent, not btoa: btoa throws on letters above U+00FF.
    function iconUrl(color, letter, prod, dark) {
        return "data:image/svg+xml," + encodeURIComponent(iconSvg(color, letter, prod, dark));
    }

    // The same icon as a <span> for the popup, the palette and Settings, size
    // CSS pixels wide. An inline <svg> built through the DOM, the letter as
    // text: a page's CSP can block data: images, but not inline SVG. Its box
    // is cropped to the cloud (y 3 to 29), so outlines and badges around it in
    // Settings hug the cloud. The size is set as style so the palette's
    // ".icon svg" rule doesn't stretch it back to a square.
    function tile(color, letter, prod, dark, size) {
        const NS = "http://www.w3.org/2000/svg";
        const w = (size || 16) + "px";
        const h = ((size || 16) * 26) / 32 + "px";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 3 32 26");
        Object.assign(svg.style, { display: "block", width: w, height: h });
        shapes(color, letter, prod, dark).forEach(([tag, attrs, text]) => {
            const el = document.createElementNS(NS, tag);
            Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
            if (text) el.textContent = text;
            svg.appendChild(el);
        });
        const span = document.createElement("span");
        span.className = "nv-org-tile";
        span.setAttribute("aria-hidden", "true");
        Object.assign(span.style, { display: "inline-flex", flexShrink: "0", width: w, height: h });
        span.appendChild(svg);
        return span;
    }

    root.SFEN_ORG_COLORS = { PALETTE, ORDER, isColor, keyOf, assign, clean, merge, initial, textColor, contrast, look, iconSvg, iconUrl, tile };
})(typeof self !== "undefined" ? self : window);
