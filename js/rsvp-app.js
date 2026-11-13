import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
import { buildAnswers, countError, eventBySlug, sortInvited } from "./rsvp-model.js";

/**
 * Guest RSVP flow: find an invitation by name (find_invitees), show its events
 * (get_invitation), and save every answer at once (submit_rsvp). The functions
 * live in supabase/schema.sql; guests can't read the tables directly.
 */

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

const NOT_FOUND =
  "We couldn't find that name. Try it as it appears on your invitation, or contact Harrison (see the FAQ on the Details page).";

let supabase = null;
/** @type {{ id: string, name: string, note: string, events: import("./rsvp-model.js").InvitedEvent[] } | null} */
let invitation = null;

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

function showPanel(panel) {
  for (const p of [els.lookupPanel, els.choosePanel, els.partyPanel]) p.hidden = p !== panel;
}

function showLookup() {
  invitation = null;
  showPanel(els.lookupPanel);
  els.formFind.reset();
  setMessage("");
  els.guestName.focus();
}

/** @param {import("./rsvp-model.js").InvitedEvent} inv */
function renderEventField(inv) {
  const event = eventBySlug(inv.event);
  const slug = escapeHtml(inv.event);
  const answered = inv.coming != null;
  const yes = answered && inv.coming > 0;
  const no = answered && inv.coming === 0;
  const countField =
    inv.seats > 1
      ? `
      <label class="rsvp-field rsvp-count" ${yes ? "" : "hidden"}>
        <span class="rsvp-field__label">How many of your ${inv.seats} are coming?</span>
        <input class="rsvp-input" type="number" name="count-${slug}" inputmode="numeric"
          min="1" max="${inv.seats}" step="1" placeholder="1 to ${inv.seats}" data-seats="${inv.seats}"
          value="${yes ? inv.coming : ""}" ${yes ? "required" : "disabled"} />
      </label>`
      : "";

  return `
    <fieldset class="rsvp-event-field" data-event-slug="${slug}">
      <legend class="rsvp-event-field__name">${escapeHtml(event?.name ?? inv.event)}</legend>
      ${event?.when ? `<p class="rsvp-event-field__when">${escapeHtml(event.when)}</p>` : ""}
      <div class="rsvp-yesno" role="radiogroup" aria-label="Attending ${escapeHtml(event?.name ?? inv.event)}">
        <label class="rsvp-yesno__option">
          <input type="radio" name="attending-${slug}" value="yes" required ${yes ? "checked" : ""} />
          <span>${inv.seats > 1 ? "Yes, we'll be there" : "Yes, I'll be there"}</span>
        </label>
        <label class="rsvp-yesno__option">
          <input type="radio" name="attending-${slug}" value="no" required ${no ? "checked" : ""} />
          <span>${inv.seats > 1 ? "No, we can't make it" : "No, I can't make it"}</span>
        </label>
      </div>
      ${countField}
    </fieldset>
  `;
}

function renderInvitation() {
  const seatsLine = invitation.events.some((e) => e.seats > 1)
    ? `<p class="rsvp-intro">Each event needs a yes or no. If you're coming, tell us how many from your invitation will be there.</p>`
    : `<p class="rsvp-intro">Each event needs a yes or no.</p>`;

  els.guestFields.innerHTML = `
    ${seatsLine}
    ${invitation.events.map(renderEventField).join("")}
    <label class="rsvp-field">
      <span class="rsvp-field__label">Dietary needs (optional)</span>
      <input class="rsvp-input" type="text" name="note" maxlength="500" placeholder="Allergies or dietary needs for anyone coming" value="${escapeHtml(invitation.note)}" />
    </label>
  `;

  // Show the count only after Yes, and only require it then.
  els.guestFields.querySelectorAll(".rsvp-event-field").forEach((fieldset) => {
    const count = fieldset.querySelector(".rsvp-count");
    if (!count) return;
    const input = count.querySelector("input");
    const seats = Number(input.dataset.seats);
    const check = () => input.setCustomValidity(input.disabled ? "" : countError(seats, input.value));
    input.addEventListener("input", () => {
      check();
      if (!input.validity.valid) input.reportValidity();
    });
    check();
    fieldset.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        const yes = radio.value === "yes" && radio.checked;
        count.hidden = !yes;
        input.disabled = !yes;
        input.required = yes;
        check();
      });
    });
  });
}

/** @param {string} inviteeId */
async function loadInvitation(inviteeId) {
  setMessage("Opening your invitation…");
  const { data, error } = await supabase.rpc("get_invitation", { invitee: inviteeId });
  if (error || !data) {
    console.error("get_invitation failed:", error);
    setMessage("We couldn't open that invitation. Try again in a moment.", true);
    return;
  }

  invitation = {
    id: inviteeId,
    name: data.name,
    note: data.note ?? "",
    events: sortInvited(data.events ?? []),
  };
  if (invitation.events.length === 0) {
    setMessage("This invitation has no events to answer. Contact Harrison if that looks wrong.", true);
    return;
  }

  setMessage(invitation.events.some((e) => e.coming != null) ? "Your earlier answers are filled in. Change anything and send again." : "");
  els.partyTitle.textContent = `RSVP for ${invitation.name}`;
  renderInvitation();
  showPanel(els.partyPanel);
}

/** @param {{ invitee_id: string, name: string }[]} matches */
function showChoices(matches) {
  showPanel(els.choosePanel);
  setMessage("");
  els.guestChoices.innerHTML = matches
    .map(
      (m) => `
        <li>
          <button type="button" class="rsvp-choice" data-invitee-id="${escapeHtml(m.invitee_id)}">
            <span class="rsvp-choice__name">${escapeHtml(m.name)}</span>
          </button>
        </li>`
    )
    .join("");
  els.guestChoices.querySelectorAll(".rsvp-choice").forEach((btn) => {
    btn.addEventListener("click", () => loadInvitation(btn.getAttribute("data-invitee-id")));
  });
}

async function findInvitation(e) {
  e.preventDefault();
  if (!supabase) {
    setMessage("RSVP isn't set up yet. Check back soon.", true);
    return;
  }
  const query = els.guestName.value.trim();
  if (!query) {
    setMessage("Enter your name.", true);
    return;
  }

  setMessage("Searching…");
  const { data, error } = await supabase.rpc("find_invitees", { query });
  if (error) {
    console.error("find_invitees failed:", error);
    setMessage("The search didn't work. Try again in a moment.", true);
    return;
  }
  if (!data || data.length === 0) {
    setMessage(NOT_FOUND, true);
    return;
  }
  if (data.length === 1) {
    await loadInvitation(data[0].invitee_id);
    return;
  }
  showChoices(data);
}

async function submitRSVP(e) {
  e.preventDefault();
  if (!supabase || !invitation) return;

  const form = new FormData(els.formRsvp);
  const choices = {};
  for (const inv of invitation.events) {
    choices[inv.event] = {
      attending: form.get(`attending-${inv.event}`) ?? "",
      count: form.get(`count-${inv.event}`) ?? "",
    };
  }
  const { answers, missing } = buildAnswers(invitation.events, choices);
  const overCap = invitation.events.find(
    (inv) => choices[inv.event].attending === "yes" && inv.seats > 1 && choices[inv.event].count.trim() !== "" &&
      countError(inv.seats, choices[inv.event].count)
  );
  if (overCap) {
    const name = eventBySlug(overCap.event)?.name ?? overCap.event;
    setMessage(`${name}: ${countError(overCap.seats, choices[overCap.event].count)}`, true);
    els.formRsvp.reportValidity();
    return;
  }
  if (missing.length) {
    setMessage(`Answer every event before sending. Still needed: ${missing.join(", ")}.`, true);
    els.formRsvp.reportValidity();
    return;
  }

  const button = els.formRsvp.querySelector('button[type="submit"]');
  button.disabled = true;
  setMessage("Sending…");
  const { error } = await supabase.rpc("submit_rsvp", {
    invitee: invitation.id,
    answers,
    note: String(form.get("note") ?? "").trim(),
  });
  button.disabled = false;

  if (error) {
    console.error("submit_rsvp failed:", error);
    setMessage(`Your RSVP wasn't saved: ${error.message || "unknown error"}. Try again, or contact Harrison.`, true);
    return;
  }
  setMessage("Thank you. Your RSVP is saved. You can come back and change it any time before the deadline.");
}

function init() {
  if (isConfigReady()) supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  els.formFind.addEventListener("submit", findInvitation);
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
