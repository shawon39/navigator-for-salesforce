// ui.js
// Small UI kit shared by the popup scripts: stroke icons (Lucide shapes, as in
// the design), a toast with optional Undo, and an inline "Remove X?" confirm.
(function () {
    "use strict";

    const PATHS = {
        search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
        gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
        chevronDown: '<path d="m6 9 6 6 6-6"/>',
        chevronLeft: '<path d="m15 18-6-6 6-6"/>',
        x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
        wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
        box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
        file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
        bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
        panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/>',
        enter: '<path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/>',
        pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
        more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
        pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
        info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
        clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
        terminal: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
        flow: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
        upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    };

    function icon(name, size, strokeWidth) {
        return (
            `<svg class="nv-icon" width="${size || 16}" height="${size || 16}" viewBox="0 0 24 24" fill="none" ` +
            `stroke="currentColor" stroke-width="${strokeWidth || 1.8}" stroke-linecap="round" ` +
            `stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`
        );
    }

    // Fill any <span data-icon="name" data-size=".."> placeholders in static HTML.
    function fillIcons(root) {
        (root || document).querySelectorAll("[data-icon]").forEach((el) => {
            el.outerHTML = icon(el.dataset.icon, +el.dataset.size || 16, +el.dataset.stroke || 1.8);
        });
    }

    let toastEl = null;
    let toastTimer = null;
    // Bottom-centered toast; pass onUndo to show an Undo button.
    function toast(message, onUndo) {
        if (toastEl) toastEl.remove();
        clearTimeout(toastTimer);
        toastEl = document.createElement("div");
        toastEl.className = "nv-toast";
        toastEl.setAttribute("role", "status");
        const text = document.createElement("span");
        text.textContent = message;
        toastEl.appendChild(text);
        if (onUndo) {
            const undo = document.createElement("button");
            undo.type = "button";
            undo.className = "nv-btn-link";
            undo.textContent = "Undo";
            undo.addEventListener("click", () => {
                onUndo();
                toastEl.remove();
            });
            toastEl.appendChild(undo);
        } else {
            toastEl.classList.add("no-action");
        }
        document.body.appendChild(toastEl);
        const el = toastEl;
        toastTimer = setTimeout(() => el.remove(), 5000);
    }

    // Swap a row's contents for "Remove <name>? Cancel Remove" until answered.
    function confirmInline(row, name, iconName, onConfirm) {
        const saved = Array.from(row.childNodes);
        const savedClass = row.className;
        row.className = savedClass + " is-confirm";
        row.innerHTML =
            icon(iconName) +
            '<span class="nv-confirm-text"></span>' +
            '<button type="button" class="nv-btn-quiet">Cancel</button>' +
            '<button type="button" class="nv-btn-danger">Remove</button>';
        row.querySelector(".nv-confirm-text").textContent = `Remove ${name}?`;
        const restore = () => {
            row.className = savedClass;
            row.innerHTML = "";
            saved.forEach((n) => row.appendChild(n));
        };
        const [cancel, remove] = row.querySelectorAll("button");
        cancel.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            restore();
        });
        remove.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            onConfirm();
        });
        remove.focus();
    }

    window.SFEN_UI = { icon, fillIcons, toast, confirmInline };
})();
