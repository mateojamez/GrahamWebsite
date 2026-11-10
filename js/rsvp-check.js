import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
import { RSVP_EVENTS, formatAnswer, groupByInvitee, parseFilter, summarize } from "./rsvp-model.js";

/**
 * Couple's dashboard (rsvpcheck/): loads rsvp_report() and shows totals and one
 * row per invitation. The filter is kept in the URL hash (#reception, and so
 * on) so a filtered view can be bookmarked.
 */

const els = {
  filters: document.getElementById("rsvpcheck-filters"),
  summary: document.getElementById("rsvpcheck-summary"),
  message: document.getElementById("rsvpcheck-message"),
  head: document.getElementById("rsvpcheck-head"),
  body: document.getElementById("rsvpcheck-body"),
  refresh: document.getElementById("rsvpcheck-refresh"),
};

const supabase =
  SUPABASE_URL?.startsWith("http") && String(SUPABASE_ANON_KEY ?? "").length > 20
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

/** @type {import("./rsvp-model.js").ReportRow[]} */
let rows = [];

function setMessage(text, isError = false) {
  els.message.textContent = text;
  els.message.classList.toggle("rsvp-message--error", isError);
}

/** Small DOM helper; children are text or nodes, so names are never parsed as HTML. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

function renderFilters(filter) {
  const options = [{ slug: "all", name: "All events" }, ...RSVP_EVENTS];
  els.filters.replaceChildren(
    ...options.map((o) => {
      const button = h("button", { type: "button", class: "rsvpcheck-filter", "aria-pressed": String(o.slug === filter) }, o.name);
      button.addEventListener("click", () => {
        location.hash = o.slug === "all" ? "" : o.slug;
        render();
      });
      return button;
    })
  );
}

function renderTotals(events) {
  els.summary.replaceChildren(
    ...events.map((event) => {
      const t = summarize(rows, event.slug);
      const stat = (value, label) => h("div", { class: "rsvpcheck-stat" }, h("dt", {}, label), h("dd", {}, String(value)));
      return h(
        "section",
        { class: "rsvpcheck-total" },
        h("h2", { class: "rsvpcheck-total__name" }, event.name),
        h(
          "dl",
          { class: "rsvpcheck-stats" },
          stat(t.coming, "Coming"),
          stat(`${t.replied} of ${t.invitations}`, "Invitations replied"),
          stat(t.declined, "Declined"),
          stat(`${t.waiting} (${t.waitingSeats} seats)`, "No reply yet"),
          stat(t.seats, "Seats invited")
        )
      );
    })
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderTable(filter, events) {
  els.head.replaceChildren(
    h("tr", {}, h("th", {}, "Invitation"), ...events.map((e) => h("th", {}, e.name)), h("th", {}, "Dietary needs"), h("th", {}, "Replied"))
  );
  const invitees = groupByInvitee(rows, filter);
  els.body.replaceChildren(
    ...invitees.map((inv) =>
      h(
        "tr",
        {},
        h("td", {}, inv.name),
        ...events.map((e) => {
          const a = inv.answers[e.slug];
          if (!a) return h("td", { class: "rsvpcheck-na" }, "Not invited");
          const text = formatAnswer(a.seats, a.coming);
          const state = a.coming == null ? "waiting" : a.coming === 0 ? "no" : "yes";
          const seats = a.seats > 1 && a.coming == null ? ` (${a.seats})` : "";
          return h("td", { class: `rsvpcheck-answer rsvpcheck-answer--${state}` }, text + seats);
        }),
        h("td", {}, inv.note || "—"),
        h("td", {}, formatDate(inv.updated_at))
      )
    )
  );
  if (invitees.length === 0) {
    els.body.append(h("tr", {}, h("td", { colspan: String(events.length + 3) }, "No invitations yet.")));
  }
}

function render() {
  const filter = parseFilter(location.hash);
  const events = filter === "all" ? RSVP_EVENTS : RSVP_EVENTS.filter((e) => e.slug === filter);
  renderFilters(filter);
  renderTotals(events);
  renderTable(filter, events);
}

async function load() {
  if (!supabase) {
    setMessage("The dashboard isn't configured. Add the Supabase URL and key in js/supabase-config.js.", true);
    return;
  }
  setMessage("Loading…");
  const { data, error } = await supabase.rpc("rsvp_report");
  if (error) {
    console.error("rsvp_report failed:", error);
    setMessage(`Could not load RSVPs: ${error.message || "unknown error"}. Has supabase/schema.sql been run?`, true);
    return;
  }
  rows = data ?? [];
  setMessage(`Loaded ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`);
  render();
}

window.addEventListener("hashchange", render);
els.refresh.addEventListener("click", load);
render();
load();
