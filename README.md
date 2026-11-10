# Graham Wedding - Event Web Platform

Production wedding website built for my friends. The site is the single guest-facing channel for event information, registry discovery, and RSVP capture ahead of a response deadline.

Built as a **static multi-page front end** with a **Supabase-backed RSVP subsystem** - no custom application server, no build pipeline for content pages, and no guest login flow. Guests identify themselves by name; responses persist in PostgreSQL via the Supabase/PostgREST API.

---

## Problem & impact


| Stakeholder need                                                    | How the system addresses it                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Guests need one place for date, venue, dress code, and FAQs         | Structured content pages with semantic HTML, mobile layout, and accessible navigation |
| Couple needs headcount and dietary data for catering                | Per-guest RSVP records with attendance boolean and free-text dietary field            |
| Invitations are sent by **party** (household), not individual login | Party-centric data model; one lookup loads every guest on the invitation              |
| Common names / partial name entry                                   | Dual-index guest search plus client-side disambiguation UI                            |
| Registry spans multiple vendors                                     | Curated outbound links (Amazon, Target, Venmo) without embedding third-party widgets  |
| Couple needs response tracking before the deadline                  | Unlisted `rsvpcheck/` dashboard buckets guests by attending, declined, or no response |


The RSVP path replaces manual tracking (texts, spreadsheets) with **idempotent writes**: re-submitting updates the same row per invitation and event, so guests can change answers without duplicate records.

---

## Repository layout

```
├── index.html              # Home: title page, schedule, before-you-arrive, RSVP call
├── info.html               # Details: dress code and FAQs (native <details>)
├── rsvp.html               # RSVP shell + progressive panels
├── css/
│   └── styles.css          # Storybook design system + rsvpcheck styles
├── js/
│   ├── wedding-config.js        # Single source of truth for wedding details
│   ├── apply-wedding-config.js  # Renders config into every page
│   ├── rsvp-model.js            # RSVP events, answer rules, dashboard totals
│   ├── rsvp-app.js              # Guest lookup and RSVP form
│   ├── rsvp-check.js            # Dashboard: per-event totals and answers
│   └── supabase-config.js       # Project URL + anon key
├── registry-list/
│   └── index.html          # Registry links from the config
├── rsvpcheck/
│   └── index.html          # Unlisted couple dashboard (not in main nav)
├── images/                 # Watercolor decals, cropped and cleaned for the web
├── reference-decals/       # Source decal art
├── reference-mockups/      # Design reference
├── supabase/schema.sql     # Tables and RSVP functions
├── supabase/tests/         # SQL checks
├── scripts/                # Guest CSV to SQL import
├── tests/                  # Node tests for js/rsvp-model.js
└── README.md
```

Local debugging uses the parent workspace `.vscode/` launch config and task (`python -m http.server 8080`).

---

## Data model

The schema lives in `supabase/schema.sql` and is applied by hand in the Supabase SQL editor.

```
invitees     id, name ("Pat and Lee Doe and Family"), note (dietary needs)
invitations  id, invitee_id, event, seats      -- one row per invited event
responses    invitation_id, coming, updated_at -- 0 = No; 1..seats = Yes
```

RSVP events: `ring-ceremony`, `reception` (Arizona), and `open-house` (Utah). The temple sealing takes no RSVP.

- Reception list: invited to the Reception and the Open House.
- Ring Ceremony list: invited to all three.

RLS is on with no policies, so the publishable key can't read or write tables directly. The browser calls four `security definer` functions:

| Function | Purpose |
|---|---|
| `find_invitees(query)` | Up to 10 invitations whose name contains every typed word (exact, 3+ letter prefix, or a small typo). |
| `get_invitation(invitee)` | The invitation's events, seats, and saved answers. |
| `submit_rsvp(invitee, answers, note)` | Saves every answer at once. Rejects a missing event, an extra event, or a count outside 0 to seats. |
| `rsvp_report()` | Every invitation and answer, for `rsvpcheck/`. |

## RSVP flow

1. The guest types a name. One match opens the invitation; several show a list to choose from.
2. Each invited event requires Yes or No. A Yes on a multi-seat invitation also requires how many are coming.
3. One optional dietary note covers the invitation. Returning guests see their answers filled in.

`rsvpcheck/` shows per-event totals (coming, replied, declined, no reply, seats) and one row per invitation, filterable by event through the URL hash.

## Importing the guest list

The guest list never goes in git. To load it:

1. Export the spreadsheet as CSV.
2. Run `python scripts/guests_to_sql.py GUESTS.csv OUT.sql --rename "OLD=NEW"`, with `OUT.sql` outside the repo. The script prints totals and notes (merged names, guessed counts).
3. Paste `OUT.sql` into the Supabase SQL editor. It replaces all invitations and answers.

## Tests

- `node --test tests/*.test.mjs`: browser RSVP logic.
- `python -m unittest discover scripts`: the import script.
- `supabase/tests/rsvp_checks.sql`: paste into the SQL editor after the schema; it rolls back and ends with `all rsvp checks passed`.

---

## Front-end design system

The main site uses a **token-driven CSS architecture** (`:root` custom properties for color, typography, shadows, radius). Notable implementation choices:

- **Layered hero:** full-viewport photography, scrim, decorative Victorian decals, and overlapping "paper" story section (`z-index` stacking)
- **Section composition:** split layouts with framed photography, cream/dark/sage section bands, and lace overlap between dress-code and RSVP CTAs
- **Responsive typography:** `clamp()` scales display type; `env(safe-area-inset-*)` respects notched devices
- **Performance:** `loading="lazy"` and `decoding="async"` on non-critical images; font preconnect to Google Fonts
- **Registry page:** intentionally separate theme (`Plus Jakarta Sans`, card layout) to match vendor link-hub patterns while staying on-brand

The registry page links out to third-party checkout flows with `rel="noopener noreferrer"` - no iframe embeds or tracking scripts in the maintained source.

---

## Local development

Static ES modules require a local HTTP origin (file:// will block imports).

**Option A - VS Code (recommended)**

Parent workspace includes a launch configuration that starts Python's static server and opens Chrome:

```bash
python -m http.server 8080 --bind 127.0.0.1
```

Serve from the `grahamwebsite/` directory, then open `http://localhost:8080`.

**Option B - manual**

```bash
cd grahamwebsite
python -m http.server 8080 --bind 127.0.0.1
```

### Supabase credentials

Edit `js/supabase-config.js`:

```js
export const SUPABASE_URL = "https://<project>.supabase.co";
export const SUPABASE_ANON_KEY = "<anon-key>";
```

Comments in that file reference `NEXT_PUBLIC_SUPABASE_*` variables used elsewhere in the couple's tooling; this static site reads the same project credentials directly.

---

## Security & privacy considerations


| Topic                    | Approach                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Guest authentication** | None. Possession of a matching invitation name grants access to that party's RSVP form - a conscious tradeoff for frictionless guest UX on a static site. |
| **Authorization**        | RLS blocks direct table access; guests reach data only through the functions in `supabase/schema.sql`, which return at most 10 names per search. |
| **Admin dashboard**      | `rsvpcheck/` has no password. `rsvp_report()` returns every invitation to anyone with the publishable key; the couple accepted this tradeoff. |
| **XSS**                  | User-derived strings escaped before `innerHTML` assignment in RSVP rendering; dashboard rows use `textContent`.                                           |
| **Secrets**              | Only the public anon key is present; service role keys must never ship to the browser.                                                                    |
| **PII surface**          | Names and dietary notes are written to Postgres; no analytics or ad scripts in first-party pages.                                                         |


---

## Deployment

The deployable unit is **the static file tree** (HTML, CSS, JS, images). Any static host (object storage + CDN, GitHub Pages, Netlify, etc.) suffices. The RSVP feature requires:

1. HTTPS origin (Supabase API calls from the browser)
2. `supabase/schema.sql` applied to the Supabase project
3. The guest list imported (see Importing the guest list)

No Docker, CI config, or infrastructure-as-code is checked into this repository. Remote: [github.com/mateojamez/GrahamWebsite](https://github.com/mateojamez/GrahamWebsite).

---

## Technology summary


| Layer        | Choice                            | Rationale                                                            |
| ------------ | --------------------------------- | -------------------------------------------------------------------- |
| Pages        | Hand-authored HTML                | Zero build step; easy content edits with stakeholders                |
| Styling      | Vanilla CSS                       | Shared tokens, no framework lock-in, ~1,370 lines of cohesive layout |
| RSVP logic   | ES modules + Supabase JS (esm.sh) | Typed client, nested PostgREST queries, upsert semantics             |
| Database/API | Supabase (PostgreSQL + PostgREST) | Managed auth/RLS, no custom backend to operate                       |
| Local server | Python `http.server`              | Built-in, cross-platform, sufficient for static + module loading     |


---

## Iteration history (selected)

Development proceeded in iterative passes with direct stakeholder feedback (commits through May 2026): initial v1 site shell → love story and visual refinement → RSVP integration with Supabase → FAQ and registry hub → reception timeline redesign → RSVP lookup and questionnaire fixes after user testing → repo cleanup (CSS consolidation, dead asset removal, Supabase dashboard dump deleted from git).

---

## License

Private project for the Larson/Graham wedding. All photography and copy are personal; not licensed for reuse.