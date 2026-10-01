import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
import { WEDDING } from "./wedding-config.js";
import { invitedColumn } from "./event-columns.js";

function isConfigReady() {
  const urlOk =
    SUPABASE_URL &&
    !String(SUPABASE_URL).includes("your_supabase_project_url") &&
    SUPABASE_URL.startsWith("http");
  const keyOk =
    SUPABASE_ANON_KEY &&
    !String(SUPABASE_ANON_KEY).includes("your_supabase_anon_key") &&
    String(SUPABASE_ANON_KEY).length > 20;
  return urlOk && keyOk;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {string | null | undefined} value */
function safeText(value) {
  const text = String(value ?? "").trim();
  return text === "" ? "—" : text;
}

/** @param {{ first_name: string, last_name?: string | null }} guest */
function fullName(guest) {
  const first = String(guest.first_name ?? "").trim();
  const last = String(guest.last_name ?? "").trim();
  return last ? `${first} ${last}` : first;
}

/** @param {HTMLElement} el */
function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * @param {HTMLElement} tbody
 * @param {Array<string>} cols
 */
function appendRow(tbody, cols) {
  const tr = document.createElement("tr");
  for (const col of cols) {
    const td = document.createElement("td");
    td.textContent = col;
    tr.appendChild(td);
  }
  tbody.appendChild(tr);
}

const els = {
  summary: document.getElementById("rsvpcheck-summary"),
  message: document.getElementById("rsvpcheck-message"),
  eventsRoot: document.getElementById("rsvpcheck-events"),
  refresh: document.getElementById("rsvpcheck-refresh"),
};

let supabase = null;

function setMessage(text, isError = false) {
  if (!els.message) return;
  els.message.textContent = text;
  els.message.classList.toggle("rsvp-message--error", isError);
}

/** @param {{ slug: string, name: string }} event */
function eventSectionTemplate(event) {
  const slug = escapeHtml(event.slug);
  return `
    <section class="rsvpcheck-event">
      <div class="rsvpcheck-head">
        <h2 class="rsvpcheck-title">${escapeHtml(event.name)}</h2>
      </div>
      <div class="rsvpcheck-summary" id="rsvpcheck-summary-${slug}" aria-live="polite"></div>
      <div class="rsvpcheck-grid">
        <section class="rsvpcheck-card">
          <h2 class="rsvp-party-title">Attending (Yes)</h2>
          <div class="rsvpcheck-table-wrap">
            <table class="rsvpcheck-table">
              <thead>
                <tr><th>Name</th><th>Party</th><th>Dietary Restrictions</th></tr>
              </thead>
              <tbody id="rsvpcheck-attending-${slug}"></tbody>
            </table>
          </div>
        </section>
        <section class="rsvpcheck-card">
          <h2 class="rsvp-party-title">Not Attending</h2>
          <div class="rsvpcheck-table-wrap">
            <table class="rsvpcheck-table">
              <thead>
                <tr><th>Name</th><th>Party</th><th>Dietary Restrictions</th></tr>
              </thead>
              <tbody id="rsvpcheck-not-attending-${slug}"></tbody>
            </table>
          </div>
        </section>
        <section class="rsvpcheck-card">
          <h2 class="rsvp-party-title">No Response</h2>
          <div class="rsvpcheck-table-wrap">
            <table class="rsvpcheck-table">
              <thead>
                <tr><th>Name</th><th>Party</th><th>Dietary Restrictions</th></tr>
              </thead>
              <tbody id="rsvpcheck-no-response-${slug}"></tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  `;
}

async function loadDashboard() {
  if (!supabase) {
    setMessage(
      "RSVP dashboard is not configured. Add Supabase values in js/supabase-config.js.",
      true
    );
    return;
  }

  setMessage("Loading RSVP dashboard...");

  const events = WEDDING.events.filter((e) => e.rsvp);
  const inviteColumns = events.map((e) => invitedColumn(e.slug));

  const [{ data: guests, error: guestsError }, { data: rsvps, error: rsvpsError }] =
    await Promise.all([
      supabase
        .from("guests")
        .select(
          `
          id,
          first_name,
          last_name,
          party_id,
          parties ( party_name ),
          ${inviteColumns.join(",\n          ")}
        `
        )
        .order("first_name", { ascending: true })
        .order("last_name", { ascending: true }),
      supabase.from("rsvps").select("guest_id, event, attending, dietary_restrictions"),
    ]);

  if (guestsError || rsvpsError) {
    console.error("Dashboard load failed:", guestsError || rsvpsError);
    setMessage("Could not load RSVP data. Check your table permissions.", true);
    return;
  }

  const rsvpByGuestEvent = new Map();
  for (const row of rsvps ?? []) {
    rsvpByGuestEvent.set(`${row.guest_id}:${row.event}`, row);
  }

  if (!els.eventsRoot) return;
  els.eventsRoot.innerHTML = events.map(eventSectionTemplate).join("");

  let totalAttending = 0;
  let totalNotAttending = 0;
  let totalNoResponse = 0;

  for (const event of events) {
    const attendingBody = document.getElementById(`rsvpcheck-attending-${event.slug}`);
    const notAttendingBody = document.getElementById(`rsvpcheck-not-attending-${event.slug}`);
    const noResponseBody = document.getElementById(`rsvpcheck-no-response-${event.slug}`);
    const summaryEl = document.getElementById(`rsvpcheck-summary-${event.slug}`);

    const attending = [];
    const notAttending = [];
    const noResponse = [];

    for (const guest of guests ?? []) {
      if (guest[invitedColumn(event.slug)] !== true) continue;

      const guestRsvp = rsvpByGuestEvent.get(`${guest.id}:${event.slug}`) || null;
      const partyName = Array.isArray(guest.parties)
        ? guest.parties[0]?.party_name
        : guest.parties?.party_name;

      const rowBase = {
        name: fullName(guest),
        party: safeText(partyName),
        dietary: safeText(guestRsvp?.dietary_restrictions),
      };

      if (guestRsvp?.attending === true) {
        attending.push(rowBase);
      } else if (guestRsvp) {
        notAttending.push(rowBase);
      } else {
        noResponse.push(rowBase);
      }
    }

    clear(attendingBody);
    clear(notAttendingBody);
    clear(noResponseBody);

    for (const row of attending) appendRow(attendingBody, [row.name, row.party, row.dietary]);
    for (const row of notAttending) appendRow(notAttendingBody, [row.name, row.party, row.dietary]);
    for (const row of noResponse) appendRow(noResponseBody, [row.name, row.party, row.dietary]);

    if (attending.length === 0) {
      appendRow(attendingBody, ["No guests marked as attending yet.", "—", "—"]);
    }
    if (notAttending.length === 0) {
      appendRow(notAttendingBody, ["No guests marked as not attending.", "—", "—"]);
    }
    if (noResponse.length === 0) {
      appendRow(noResponseBody, ["No guests without a response.", "—", "—"]);
    }

    if (summaryEl) {
      const invitedCount = attending.length + notAttending.length + noResponse.length;
      summaryEl.textContent =
        `Invited: ${invitedCount} | Attending: ${attending.length} | Not Attending: ${notAttending.length} | No Response: ${noResponse.length}`;
    }

    totalAttending += attending.length;
    totalNotAttending += notAttending.length;
    totalNoResponse += noResponse.length;
  }

  if (els.summary) {
    els.summary.textContent =
      `Total Guests: ${(guests ?? []).length} across ${events.length} events | Attending: ${totalAttending} | Not Attending: ${totalNotAttending} | No Response: ${totalNoResponse}`;
  }

  setMessage("RSVP dashboard updated.");
}

function init() {
  if (isConfigReady()) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  els.refresh?.addEventListener("click", () => {
    loadDashboard();
  });

  loadDashboard();
}

init();
