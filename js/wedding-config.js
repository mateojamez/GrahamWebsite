/**
 * Single source of truth for wedding-specific details.
 * js/apply-wedding-config.js reads these values into every page on load and
 * renders the schedule, important-information, and registry sections from them.
 *
 * Event flags:
 * - `public: true`  — the event appears in the schedule on index.html.
 * - `rsvp: true`    — guests invited to it get RSVP fields on rsvp.html and it
 *                     appears on the rsvpcheck/ dashboard. Each RSVP event needs
 *                     a matching `invited_<slug>` column on `guests`
 *                     (supabase/schema.sql).
 *
 * Values marked TODO are placeholders waiting on details from Harrison.
 */

const partnerA = { first: "Tabitha", last: "Larson" };
const partnerB = { first: "Harrison", last: "Graham" };

const events = [
  {
    slug: "temple",
    name: "Temple Sealing",
    public: false, // TODO: decide whether the temple appears on the site
    rsvp: false,
    primary: false,
    date: { iso: "", display: "Date to come" }, // TODO
    time: "", // TODO
    venue: { name: "", addressLine1: "", addressLine2: "" }, // TODO
    timeline: [],
  },
  {
    slug: "ring-ceremony",
    name: "Ring Ceremony",
    public: true,
    rsvp: true,
    primary: false,
    // TODO: confirm date and time with Harrison
    date: { iso: "2027-01-15", display: "Friday, January 15, 2027" },
    time: "",
    venue: { name: "", addressLine1: "", addressLine2: "" }, // TODO
    timeline: [], // TODO: e.g. { time: "10:00 AM", label: "Ring exchange" }
  },
  {
    slug: "reception",
    name: "Reception",
    public: true,
    rsvp: true,
    primary: true,
    // TODO: confirm date and time with Harrison
    date: { iso: "2027-01-16", display: "Saturday, January 16, 2027" },
    time: "6:00 PM",
    venue: { name: "", addressLine1: "", addressLine2: "" }, // TODO
    timeline: [], // TODO
  },
];

const primaryEvent = events.find((e) => e.primary) ?? events[0];

export const WEDDING = {
  couple: {
    partnerA,
    partnerB,
    footerNames: `${partnerA.first} ${partnerA.last} & ${partnerB.first} ${partnerB.last}`,
  },

  events,
  date: primaryEvent.date,
  city: "Mesa, Arizona", // TODO: confirm

  rsvp: {
    deadline: "", // TODO: empty hides the deadline line
  },

  // Rendered on info.html. `html` fields are trusted markup from this file.
  info: {
    dressCode: null, // TODO: { label: "…", html: "<p>…</p>" } from Harrison's write-up
    faqs: [
      {
        question: "How do I RSVP?",
        html: 'On the <a href="rsvp.html">RSVP page</a>. Search for your name as it appears on your invitation, and you can answer for everyone in your household at once.',
      },
      {
        question: "Can I change my RSVP?",
        html: "Yes. Look up your invitation again and submit new answers. The latest answers replace the earlier ones.",
      },
    ],
  },

  registry: {
    blurbHtml: "", // TODO: optional note from the couple
    links: [], // TODO: { label: "Amazon", href: "https://…" }
  },

  // Mirrors the CSS custom properties in :root (css/styles.css). A value here
  // overrides that variable site-wide once apply-wedding-config.js runs.
  theme: {
    colorVanilla: "#f7f0dc",
    colorGreen: "#203a2b",
    colorSage: "#9caf88",
    colorLavender: "#b7a6d6",
  },
};
