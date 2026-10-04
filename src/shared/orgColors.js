// orgColors.js
// Tab colors by org (Settings → Orgs, off by default). Each saved org gets a
// color from a fixed palette, and its tab icon becomes a tile in that color
// with the org's initial. Colors live in chrome.storage.sync "orgColors"
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

    // Initial color on a tile. The initial is bold, so 3:1 is enough (WCAG
    // large text); white is preferred so the light-mode tiles look alike.
    function textColor(fill) {
        return contrast(fill, WHITE) >= 3.5 ? WHITE : INK;
    }

    // Everything needed to draw one tile. dark: Chrome's tab strip is dark.
    function look(color, dark) {
        const p = PALETTE[isColor(color) ? color : ORDER[0]];
        const fill = dark ? p.dark : p.light;
        return { fill, text: textColor(fill), ring: dark && contrast(fill, "#3C3C3C") < 3 };
    }

    // The tab icon as SVG: a rounded tile, the initial, a frame for production
    // and a light ring for black on a dark tab strip. letter is one character
    // from initial(), so it can't carry markup; it's escaped anyway.
    function iconSvg(color, letter, prod, dark) {
        const t = look(color, dark);
        const ch = String(letter || "").slice(0, 2).replace(/[&<>"']/g, "");
        return (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
            `<rect x="1" y="1" width="30" height="30" rx="7" fill="${t.fill}"/>` +
            (t.ring ? `<rect x="1.5" y="1.5" width="29" height="29" rx="6.5" fill="none" stroke="${RING}" stroke-width="2"/>` : "") +
            (prod ? `<rect x="4.5" y="4.5" width="23" height="23" rx="4.5" fill="none" stroke="${t.text}" stroke-width="2"/>` : "") +
            (ch
                ? `<text x="16" y="16.5" text-anchor="middle" dominant-baseline="central" ` +
                  `font-family="system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif" font-weight="700" ` +
                  `font-size="${prod ? 15 : 19}" fill="${t.text}">${ch}</text>`
                : "") +
            "</svg>"
        );
    }

    // encodeURIComponent, not btoa: btoa throws on letters above U+00FF.
    function iconUrl(color, letter, prod, dark) {
        return "data:image/svg+xml," + encodeURIComponent(iconSvg(color, letter, prod, dark));
    }

    // The same tile as a <span> for the popup, the palette and Settings, sized
    // in CSS pixels. Styles are set through the DOM, the letter as text.
    function tile(color, letter, prod, dark, size) {
        const t = look(color, dark);
        const s = size || 16;
        const span = document.createElement("span");
        span.className = "nv-org-tile";
        span.setAttribute("aria-hidden", "true");
        span.textContent = letter || "";
        const shadows = [];
        if (prod) {
            const gap = Math.max(1, Math.round(s * 0.1 * 2) / 2);
            shadows.push(`inset 0 0 0 ${gap}px ${t.fill}`, `inset 0 0 0 ${gap + Math.max(1, Math.round(s * 0.06 * 2) / 2)}px ${t.text}`);
        }
        if (t.ring) shadows.push(`0 0 0 1px ${RING}`);
        Object.assign(span.style, {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: "0",
            boxSizing: "border-box",
            width: s + "px",
            height: s + "px",
            borderRadius: Math.round((s * 7) / 32) + "px",
            background: t.fill,
            color: t.text,
            boxShadow: shadows.join(", "),
            font: `700 ${Math.round(s * (prod ? 0.47 : 0.6))}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`,
            lineHeight: "1",
        });
        return span;
    }

    root.SFEN_ORG_COLORS = { PALETTE, ORDER, isColor, keyOf, assign, clean, initial, textColor, contrast, look, iconSvg, iconUrl, tile };
})(typeof self !== "undefined" ? self : window);
