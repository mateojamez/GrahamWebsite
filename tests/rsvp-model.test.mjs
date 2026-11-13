// Run: node --test tests/*.test.mjs   (names here are invented)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RSVP_EVENTS,
  buildAnswers,
  countError,
  formatAnswer,
  summarize,
  groupByInvitee,
  parseFilter,
  sortInvited,
} from "../js/rsvp-model.js";

test("RSVP events are the ring ceremony, Arizona reception, and Utah open house, in that order", () => {
  assert.deepEqual(
    RSVP_EVENTS.map((e) => [e.slug, e.name]),
    [
      ["ring-ceremony", "Ring Ceremony & Brunch"],
      ["reception", "Arizona Reception"],
      ["open-house", "Utah Open House"],
    ]
  );
  assert.ok(RSVP_EVENTS.every((e) => e.when.length > 0));
});

test("sortInvited puts events in RSVP order and drops unknown slugs", () => {
  const sorted = sortInvited([
    { event: "open-house", seats: 1, coming: null },
    { event: "temple", seats: 1, coming: null },
    { event: "ring-ceremony", seats: 1, coming: null },
  ]);
  assert.deepEqual(sorted.map((e) => e.event), ["ring-ceremony", "open-house"]);
});

const invited = [
  { event: "ring-ceremony", seats: 1, coming: null },
  { event: "reception", seats: 5, coming: null },
  { event: "open-house", seats: 5, coming: null },
];

test("buildAnswers maps yes, no, and counts", () => {
  const { answers, missing } = buildAnswers(invited, {
    "ring-ceremony": { attending: "yes", count: "" },
    reception: { attending: "yes", count: "3" },
    "open-house": { attending: "no", count: "4" },
  });
  assert.deepEqual(answers, { "ring-ceremony": 1, reception: 3, "open-house": 0 });
  assert.deepEqual(missing, []);
});

test("buildAnswers requires every event, and a count for a multi-seat yes", () => {
  const { missing } = buildAnswers(invited, {
    "ring-ceremony": { attending: "", count: "" },
    reception: { attending: "yes", count: "" },
  });
  assert.deepEqual(missing, ["Ring Ceremony & Brunch", "Arizona Reception", "Utah Open House"]);
});

test("buildAnswers rejects counts outside 1 to seats", () => {
  for (const count of ["0", "6", "2.5", "x"]) {
    const { missing } = buildAnswers([invited[1]], { reception: { attending: "yes", count } });
    assert.deepEqual(missing, ["Arizona Reception"], `count ${count}`);
  }
});

test("formatAnswer", () => {
  assert.equal(formatAnswer(1, 1), "Yes");
  assert.equal(formatAnswer(1, 0), "No");
  assert.equal(formatAnswer(5, 0), "No");
  assert.equal(formatAnswer(5, 2), "2 of 5");
  assert.equal(formatAnswer(3, null), "No reply");
});

const rows = [
  { invitee_id: "a", name: "Ann Zed", note: "", event: "ring-ceremony", seats: 2, coming: 2, updated_at: "2026-11-02T00:00:00Z" },
  { invitee_id: "a", name: "Ann Zed", note: "", event: "reception", seats: 2, coming: 1, updated_at: "2026-11-03T00:00:00Z" },
  { invitee_id: "b", name: "bo Yew", note: "nuts", event: "reception", seats: 5, coming: 0, updated_at: "2026-11-01T00:00:00Z" },
  { invitee_id: "c", name: "Cy Ex", note: "", event: "reception", seats: 3, coming: null, updated_at: null },
];

test("summarize totals one event", () => {
  assert.deepEqual(summarize(rows, "reception"), {
    invitations: 3, seats: 10, replied: 2, coming: 1, declined: 1, waiting: 1, waitingSeats: 3,
  });
});

test("groupByInvitee filters by event and sorts by name, ignoring case", () => {
  assert.deepEqual(groupByInvitee(rows, "ring-ceremony").map((e) => e.name), ["Ann Zed"]);
  const all = groupByInvitee(rows, "all");
  assert.deepEqual(all.map((e) => e.name), ["Ann Zed", "bo Yew", "Cy Ex"]);
  assert.equal(all[0].updated_at, "2026-11-03T00:00:00Z");
  assert.equal(all[2].updated_at, null);
});

test("parseFilter", () => {
  assert.equal(parseFilter("#open-house"), "open-house");
  assert.equal(parseFilter(""), "all");
  assert.equal(parseFilter("#temple"), "all");
});

test("countError accepts 1 to seats and explains anything else", () => {
  assert.equal(countError(5, "1"), "");
  assert.equal(countError(5, " 5 "), "");
  assert.equal(countError(5, ""), "Enter how many are coming.");
  assert.equal(countError(5, "0"), "Enter a whole number, 1 or more.");
  assert.equal(countError(5, "2.5"), "Enter a whole number, 1 or more.");
  assert.equal(countError(5, "x"), "Enter a whole number, 1 or more.");
  assert.equal(countError(5, "6"), "Your invitation is for 5. Enter 5 or fewer.");
});
