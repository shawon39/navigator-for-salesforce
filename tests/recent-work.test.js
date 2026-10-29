// Palette helpers for Recent work: when an item changed ("3h ago"), and
// each kind's row (its Setup page or Flow Builder link).
const path = require("path");
const assert = require("assert");
global.self = global;
global.window = global;
require(path.resolve(__dirname, "../src/shared/sfUrl.js"));
require(path.resolve(__dirname, "../src/shared/setupPages.js"));
require(path.resolve(__dirname, "../src/content/commandPalette.data.js"));
const { timeAgo, workItem } = window.SFEN_CMDK_DATA;

const now = new Date(2026, 9, 29, 15, 0).getTime();
const at = (d, h, m) => new Date(2026, 9, d, h, m || 0).toISOString();
for (const [iso, expected] of [
    [at(29, 15, 0), "just now"],
    [at(29, 14, 55), "5m ago"],
    [at(29, 12, 0), "3h ago"],
    [at(29, 0, 30), "14h ago"],
    [at(28, 23, 0), "yesterday"],
    ["not a date", ""],
]) {
    assert.strictEqual(timeAgo(iso, now), expected, iso);
}
console.log("PASS timeAgo: minutes, hours today, then yesterday");

const flow = workItem({ kind: "flow", id: "301000000000002AAA", flow: "300000000000001AAA", label: "Lead Routing", date: at(29, 13), byName: "Marcus Chen", mine: false }, now, true);
assert.deepStrictEqual(
    [flow.label, flow.hint, flow.sub, flow.url, flow.flow],
    ["Lead Routing", "Flow", "2h ago · Marcus Chen", "/builder_platform_interaction/flowBuilder.app?flowId=301000000000002AAA", "300000000000001AAA"]
);
const mine = workItem({ kind: "permSet", id: "0PS000000000001AAA", label: "Sales Ops", date: at(29, 13), byName: "Me", mine: true }, now, true);
assert.deepStrictEqual([mine.sub, mine.url], ["2h ago · you", "/lightning/setup/PermSets/page?address=%2F0PS000000000001AAA"]);
assert.strictEqual(workItem({ kind: "permSet", id: "0PS000000000001AAA", label: "x", date: at(29, 13), mine: true }, now, false).sub, "2h ago");
const fld = workItem({ kind: "field", id: "00N000000000001AAA", object: "Opportunity", label: "Renewal_Date__c", date: at(29, 13) }, now, false);
assert.strictEqual(fld.url, "/lightning/setup/ObjectManager/Opportunity/FieldsAndRelationships/00N000000000001/view");
console.log("PASS workItem: links per kind; who changed it only for everyone's changes");
console.log("ALL PASS");
