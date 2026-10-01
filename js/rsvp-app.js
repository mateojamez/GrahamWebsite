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

const els = {
  lookupPanel: document.getElementById("rsvp-lookup"),
  choosePanel: document.getElementById("rsvp-choose"),
  partyPanel: document.getElementById("rsvp-party"),
  formFind: document.getElementById("form-find"),
  formRsvp: document.getElementById("form-rsvp"),
  guestName: document.getElementById("guest-name"),
  guestChoices: document.getElementById("guest-choices"),
  partyTitle: document.getElementById("party-title"),
  guestFields: document.getElementById("guest-fields"),
  message: document.getElementById("rsvp-message"),
  btnReset: document.getElementById("btn-reset-party"),
  btnBackLookup: document.getElementById("btn-back-lookup"),
};

let supabase = null;
/**
 * @type {{ id: string, party_name: string, guests: Record<string, unknown>[] } | null}
 * Each guest also carries one `invited_<slug>` boolean per RSVP event
 * (see EVENT_INVITE_COLUMNS below), fetched dynamically so the query stays in
 * sync with whatever events are listed in wedding-config.js.
 */
let party = null;
/** responses[guestId][eventSlug] = { attending: "yes" | "no" | "", dietary_restrictions: string } */
const responses = {};

/** Only events with `rsvp: true` get RSVP fields; the temple, for example, doesn't. */
const RSVP_EVENTS = WEDDING.events.filter((e) => e.rsvp);
const EVENT_INVITE_COLUMNS = RSVP_EVENTS.map((e) => invitedColumn(e.slug));

/** @param {Record<string, unknown>} guest */
function invitedEventsForGuest(guest) {
  return RSVP_EVENTS.filter((e) => guest[invitedColumn(e.slug)] === true);
}

function setMessage(text, isError = false) {
  els.message.textContent = text;
  els.message.classList.toggle("rsvp-message--error", isError);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeNamePart(value) {
  return String(value ?? "").trim().toLowerCase();
}

/** @param {string} input */
function parseNameInput(input) {
  const trimmed = input.trim();
  if (!trimmed) return { first: "", last: "" };
  const parts = trimmed.split(/\s+/);
  return {
    first: parts[0],
    last: parts.slice(1).join(" "),
  };
}

/** @param {{ first_name: string, last_name?: string | null }} guest */
function formatGuestName(guest) {
  const first = String(guest.first_name ?? "").trim();
  const last = guest.last_name == null ? "" : String(guest.last_name).trim();
  return last ? `${first} ${last}` : first;
}

/**
 * @param {{ first_name: string, last_name?: string | null }} guest
 * @param {string} userFirst
 * @param {string} userLast
 */
function guestMatchesSearch(guest, userFirst, userLast) {
  const guestFirst = normalizeNamePart(guest.first_name);
  const guestLast =
    guest.last_name == null || String(guest.last_name).trim() === ""
      ? null
      : normalizeNamePart(guest.last_name);
  const uFirst = normalizeNamePart(userFirst);
  const uLast = userLast ? normalizeNamePart(userLast) : "";

  if (!uFirst) return false;

  if (uLast) {
    if (guestFirst !== uFirst) return false;
    if (guestLast === null) return false;
    return guestLast === uLast;
  }

  const token = uFirst;
  if (guestFirst === token) return true;
  if (guestLast !== null && guestLast === token) return true;
  return false;
}

const GUEST_LOOKUP_SELECT = `
  id,
  first_name,
  last_name,
  party_id,
  parties (
    party_name
  )
`;

/** @param {import("@supabase/supabase-js").SupabaseClient} db */
async function fetchGuestCandidates(db, userFirst, userLast) {
  const byFirst = await db
    .from("guests")
    .select(GUEST_LOOKUP_SELECT)
    .ilike("first_name", userFirst);

  if (byFirst.error) return { data: null, error: byFirst.error };

  const byLast = await db
    .from("guests")
    .select(GUEST_LOOKUP_SELECT)
    .ilike("last_name", userLast || userFirst);

  if (byLast.error) return { data: null, error: byLast.error };

  const merged = new Map();
  for (const guest of [...(byFirst.data ?? []), ...(byLast.data ?? [])]) {
    merged.set(guest.id, guest);
  }
  return { data: [...merged.values()], error: null };
}

/** @param {string} guestId @param {{ slug: string, name: string }} event */
function renderEventField(guestId, event) {
  return `
    <div class="rsvp-event-field" data-event-slug="${escapeHtml(event.slug)}">
      <h3 class="rsvp-event-field__name">${escapeHtml(event.name)}</h3>
      <label class="rsvp-field">
        <span class="rsvp-field__label">Attending?</span>
        <select class="rsvp-input" required data-guest-id="${escapeHtml(guestId)}" data-event-slug="${escapeHtml(event.slug)}" data-field="attending">
          <option value="">Select one</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <label class="rsvp-field">
        <span class="rsvp-field__label">Dietary restrictions</span>
        <input class="rsvp-input" type="text" placeholder="Allergies or dietary needs" data-guest-id="${escapeHtml(guestId)}" data-event-slug="${escapeHtml(event.slug)}" data-field="dietary_restrictions" />
      </label>
    </div>
  `;
}

function renderGuestFields(guests) {
  Object.keys(responses).forEach((k) => delete responses[k]);

  els.guestFields.innerHTML = guests
    .map((g) => {
      const invitedEvents = invitedEventsForGuest(g);
      const eventFields = invitedEvents.length
        ? invitedEvents.map((event) => renderEventField(g.id, event)).join("")
        : `<p class="rsvp-field__label">No events to RSVP for.</p>`;

      return `
    <article class="rsvp-guest-card" data-guest-id="${escapeHtml(g.id)}">
      <h2 class="rsvp-guest-card__name">${escapeHtml(formatGuestName(g))}</h2>
      ${eventFields}
    </article>
  `;
    })
    .join("");

  els.guestFields.querySelectorAll("[data-field]").forEach((input) => {
    const guestId = input.getAttribute("data-guest-id");
    const eventSlug = input.getAttribute("data-event-slug");
    const field = input.getAttribute("data-field");
    const sync = () => {
      responses[guestId] = responses[guestId] || {};
      responses[guestId][eventSlug] = responses[guestId][eventSlug] || {};
      responses[guestId][eventSlug][field] = input.value;
    };
    input.addEventListener("input", sync);
    input.addEventListener("change", sync);
  });
}

function showLookup() {
  party = null;
  els.lookupPanel.hidden = false;
  els.choosePanel.hidden = true;
  els.partyPanel.hidden = true;
  els.formFind.reset();
  setMessage("");
}

function showParty(p) {
  party = p;
  els.lookupPanel.hidden = true;
  els.choosePanel.hidden = true;
  els.partyPanel.hidden = false;
  els.partyTitle.textContent = `RSVP for ${p.party_name}`;
  renderGuestFields(p.guests || []);
}

/** @param {Array<{ id: string, first_name: string, last_name?: string | null, party_id: string, parties?: { party_name: string } | { party_name: string }[] | null }>} matches */
function showGuestChoices(matches) {
  els.lookupPanel.hidden = true;
  els.choosePanel.hidden = false;
  els.partyPanel.hidden = true;
  setMessage("");

  els.guestChoices.innerHTML = matches
    .map((guest) => {
      const partyName = Array.isArray(guest.parties)
        ? guest.parties[0]?.party_name
        : guest.parties?.party_name;
      const partyLabel = partyName ? escapeHtml(partyName) : "Invitation";
      return `
        <li>
          <button type="button" class="rsvp-choice" data-party-id="${escapeHtml(guest.party_id)}">
            <span class="rsvp-choice__name">${escapeHtml(formatGuestName(guest))}
            </span>
            <span class="rsvp-choice__party">${partyLabel}</span>
          </button>
        </li>
      `;
    })
    .join("");

  els.guestChoices.querySelectorAll(".rsvp-choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      const partyId = btn.getAttribute("data-party-id");
      if (partyId) loadParty(partyId);
    });
  });
}

async function loadParty(partyId) {
  if (!supabase) return;

  const { data: partyData, error } = await supabase
    .from("parties")
    .select(
      `
        id,
        party_name,
        guests (
          id,
          first_name,
          last_name,
          ${EVENT_INVITE_COLUMNS.join(",\n          ")}
        )
      `
    )
    .eq("id", partyId)
    .single();

  if (error || !partyData) {
    console.error("Party lookup failed:", error);
    setMessage("Could not load your invitation. Please try again.", true);
    return;
  }

  setMessage("");
  showParty(partyData);
}

async function findParty(e) {
  e.preventDefault();
  if (!supabase) {
    setMessage(
      "RSVP is not configured yet. Add your Supabase URL and anon key in js/supabase-config.js (same values as NEXT_PUBLIC_* in .env.local).",
      true
    );
    return;
  }

  const { first: userFirst, last: userLast } = parseNameInput(els.guestName.value);
  if (!userFirst) {
    setMessage("Please enter your name.", true);
    return;
  }

  const { data: candidates, error } = await fetchGuestCandidates(
    supabase,
    userFirst,
    userLast
  );

  if (error) {
    console.error("Guest lookup failed:", error);
    setMessage("No invitation found. Please check the name on your invitation.", true);
    return;
  }

  const matches = (candidates ?? []).filter((guest) =>
    guestMatchesSearch(guest, userFirst, userLast)
  );

  if (matches.length === 0) {
    setMessage("No invitation found. Please check the name on your invitation.", true);
    return;
  }

  const uniqueMatches = [...new Map(matches.map((g) => [g.id, g])).values()];
  const partyIds = new Set(uniqueMatches.map((g) => g.party_id));

  if (partyIds.size === 1) {
    setMessage("");
    await loadParty(uniqueMatches[0].party_id);
    return;
  }

  showGuestChoices(uniqueMatches);
}

async function submitRSVP(e) {
  e.preventDefault();
  if (!supabase || !party) return;

  const guests = party.guests || [];
  const rows = [];
  for (const guest of guests) {
    for (const event of invitedEventsForGuest(guest)) {
      const answer = responses[guest.id]?.[event.slug] || {};
      rows.push({
        guest_id: guest.id,
        event: event.slug,
        attending: answer.attending === "yes",
        dietary_restrictions: answer.dietary_restrictions || "",
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length === 0) {
    setMessage("There are no events to RSVP for on this invitation.", true);
    return;
  }

  const { error } = await supabase.from("rsvps").upsert(rows, { onConflict: "guest_id,event" });

  if (error) {
    console.error("RSVP upsert failed:", error);
    const detail = error.message || String(error);
    setMessage(`Could not save RSVP: ${detail}`, true);
    return;
  }

  setMessage("RSVP sent. Thank you!");
}

function init() {
  if (isConfigReady()) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  els.formFind.addEventListener("submit", findParty);
  els.formRsvp.addEventListener("submit", submitRSVP);
  els.btnReset.addEventListener("click", (e) => {
    e.preventDefault();
    showLookup();
  });
  els.btnBackLookup.addEventListener("click", (e) => {
    e.preventDefault();
    showLookup();
  });
}

init();
