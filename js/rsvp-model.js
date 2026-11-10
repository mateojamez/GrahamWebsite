/**
 * RSVP logic shared by rsvp.html and rsvpcheck/, kept free of the DOM and of
 * Supabase so `node --test tests/*.test.mjs` can run it.
 *
 * Answers are a number of people coming per event: 0 means No. One-seat
 * invitations answer Yes or No; larger ones answer Yes or No, then how many.
 */
import { WEDDING } from "./wedding-config.js";

/**
 * @typedef {{ slug: string, name: string, when: string }} RsvpEvent
 * @typedef {{ event: string, seats: number, coming: number | null }} InvitedEvent
 * @typedef {{ invitee_id: string, name: string, note: string, event: string, seats: number, coming: number | null, updated_at: string | null }} ReportRow
 */

/** Every event that takes an RSVP, in the order guests answer them. @type {RsvpEvent[]} */
export const RSVP_EVENTS = [...WEDDING.events, WEDDING.openHouse]
  .filter((e) => e && e.rsvp)
  .map((e) => ({
    slug: e.slug,
    name: e.rsvpName || e.name,
    when: [e.date?.display, e.time].filter(Boolean).join(" · "),
  }));

const ORDER = RSVP_EVENTS.map((e) => e.slug);

/** @param {string} slug */
export function eventBySlug(slug) {
  return RSVP_EVENTS.find((e) => e.slug === slug) ?? null;
}

/** Invited events sorted into RSVP order, dropping any slug the site doesn't know. @param {InvitedEvent[]} events */
export function sortInvited(events) {
  return events.filter((e) => ORDER.includes(e.event)).sort((a, b) => ORDER.indexOf(a.event) - ORDER.indexOf(b.event));
}

/**
 * Turns form choices into the `answers` object submit_rsvp() takes.
 * @param {InvitedEvent[]} invited
 * @param {Record<string, { attending: "yes" | "no" | "", count: string }>} choices keyed by event slug
 * @returns {{ answers: Record<string, number>, missing: string[] }} missing = names of unanswered events
 */
export function buildAnswers(invited, choices) {
  const answers = {};
  const missing = [];
  for (const inv of invited) {
    const choice = choices[inv.event] ?? { attending: "", count: "" };
    const name = eventBySlug(inv.event)?.name ?? inv.event;
    if (choice.attending === "no") {
      answers[inv.event] = 0;
    } else if (choice.attending === "yes" && inv.seats === 1) {
      answers[inv.event] = 1;
    } else if (choice.attending === "yes") {
      const n = Number(choice.count);
      if (Number.isInteger(n) && n >= 1 && n <= inv.seats) answers[inv.event] = n;
      else missing.push(name);
    } else {
      missing.push(name);
    }
  }
  return { answers, missing };
}

/** "Yes", "No", "3 of 5", or "No reply". @param {number} seats @param {number | null} coming */
export function formatAnswer(seats, coming) {
  if (coming == null) return "No reply";
  if (coming === 0) return "No";
  if (seats === 1) return "Yes";
  return `${coming} of ${seats}`;
}

/** Totals for one event. @param {ReportRow[]} rows @param {string} slug */
export function summarize(rows, slug) {
  const t = { invitations: 0, seats: 0, replied: 0, coming: 0, declined: 0, waiting: 0, waitingSeats: 0 };
  for (const r of rows) {
    if (r.event !== slug) continue;
    t.invitations += 1;
    t.seats += r.seats;
    if (r.coming == null) {
      t.waiting += 1;
      t.waitingSeats += r.seats;
    } else {
      t.replied += 1;
      t.coming += r.coming;
      if (r.coming === 0) t.declined += 1;
    }
  }
  return t;
}

/**
 * One entry per invitee, sorted by name. With an event filter, only invitees
 * invited to that event.
 * @param {ReportRow[]} rows
 * @param {string} filter an event slug or "all"
 */
export function groupByInvitee(rows, filter) {
  const byId = new Map();
  for (const r of rows) {
    if (!byId.has(r.invitee_id)) {
      byId.set(r.invitee_id, { invitee_id: r.invitee_id, name: r.name, note: r.note, updated_at: null, answers: {} });
    }
    const entry = byId.get(r.invitee_id);
    entry.answers[r.event] = r;
    if (r.updated_at && (!entry.updated_at || r.updated_at > entry.updated_at)) entry.updated_at = r.updated_at;
  }
  return [...byId.values()]
    .filter((e) => filter === "all" || e.answers[filter])
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** The dashboard filter from a URL hash: an RSVP event slug, or "all". @param {string} hash */
export function parseFilter(hash) {
  const slug = String(hash ?? "").replace(/^#/, "");
  return ORDER.includes(slug) ? slug : "all";
}
