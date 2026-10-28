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
 * - `note`          — optional line under the event name, such as who is invited.
 *
 * Values marked TODO are placeholders waiting on details from Harrison.
 */

const partnerA = { first: "Tabitha", last: "Larson" };
const partnerB = { first: "Harrison", last: "Graham" };

const events = [
  {
    slug: "ring-ceremony",
    name: "Ring Ceremony & Brunch",
    public: true,
    rsvp: true,
    primary: false,
    note: "By invitation only",
    // TODO: confirm date with Harrison (the master doc implies the same day as the reception)
    date: { iso: "2027-01-15", display: "Friday, January 15, 2027" },
    time: "10:30 AM – 12:00 PM",
    venue: {
      name: "Val Vista Lakes Clubhouse",
      addressLine1: "1600 E Lakeside Dr",
      addressLine2: "Gilbert, AZ 85234",
    },
    timeline: [],
  },
  {
    slug: "temple",
    name: "Temple Sealing",
    public: true,
    rsvp: false,
    primary: false,
    note: "By invitation. Family and the wedding party stay after for photos on the temple grounds.",
    date: { iso: "", display: "Date to come" }, // TODO: same day as the reception?
    time: "", // TODO: master doc says "3 pm?"; confirm before showing it
    venue: { name: "Gilbert Arizona Temple", addressLine1: "", addressLine2: "Gilbert, AZ" },
    timeline: [],
  },
  {
    slug: "reception",
    name: "Reception",
    public: true,
    rsvp: true,
    primary: true,
    note: "",
    // TODO: confirm date with Harrison
    date: { iso: "2027-01-16", display: "Saturday, January 16, 2027" },
    time: "7:00 PM",
    venue: { name: "", addressLine1: "", addressLine2: "" }, // TODO: church address
    timeline: [],
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
  city: "Gilbert, Arizona",

  rsvp: {
    deadline: "December 1, 2026", // empty hides the deadline line
  },

  // Rendered on info.html. `html` fields are trusted markup from this file.
  info: {
    dressCode: {
      label: "Evening reception: Fantasy Renaissance (encouraged, never required)",
      html: `
        <p>Come as you'd like to arrive at a royal feast.</p>
        <ul>
          <li><strong>Full regalia:</strong> Gowns, doublets, corsets, cloaks, tunics, crowns, elven ears, and faire garb. Pirate garb is acceptable too; think formal pirate.</li>
          <li><strong>A small touch:</strong> Add one fantasy piece to dressy clothes, such as a cloak, vest, flowy sleeves, circlet, or flower crown.</li>
          <li><strong>Sunday best:</strong> Always welcome.</li>
        </ul>
        <h3>Ring Ceremony &amp; Brunch (morning)</h3>
        <p>Come in costume if you want. If you're also invited to the temple sealing, we'd rather you didn't have to change in between.</p>
        <h3>Temple Sealing &amp; photos</h3>
        <p>Costume preferred; Sunday dress is good too.</p>
        <h3>Our colors</h3>
        <p>Lavender, sage green, and dark forest green, and you're welcome to wear them. Blues and golds are also very on theme. We ask that guests avoid all-white or ivory.</p>
        <h3>Prop weapons</h3>
        <p>Blunt props are welcome, but keep them sheathed or put away. There will be children present, so we encourage leaving them at home if you can.</p>
        <h3>Weather</h3>
        <p>January evenings in Arizona get chilly. Cloaks, capes, and shawls are both practical and on theme.</p>
      `,
    },
    faqs: [
      {
        question: "Do I need to RSVP?",
        html: 'Yes. RSVPs are required for both the Ring Ceremony and the Reception by December 1, 2026, on the <a href="rsvp.html">RSVP page</a>. Search for your name as it appears on your invitation, and you can answer for everyone in your household at once. Any RSVP not received by December 1 will be marked as a "No," and we’ll let those guests know.',
      },
      {
        question: "Can I change my RSVP?",
        html: "Yes. Look up your invitation again and submit new answers. The latest answers replace the earlier ones.",
      },
      {
        question: "Who is invited to the Ring Ceremony and Temple Sealing?",
        html: "Both are small, invitation-only events. If your invitation includes them, we'd love to have you there. Family and members of the wedding party should plan to stay after the sealing for photos on the temple grounds.",
      },
      {
        question: "I'm not a member of the Church. What should I know?",
        html: "You're so welcome here. The temple sealing is a sacred ceremony attended by a small invited group. The Ring Ceremony is where we exchange rings and share the moment with friends and family, and the Reception is a celebration for everyone.",
      },
      {
        question: "Are children welcome?",
        html: "Yes. Children are welcome at the Ring Ceremony (if invited) and the Reception.",
      },
      {
        question: "Can I bring a plus-one?",
        html: "Plus-ones are welcome at the Reception. Include your guest in your RSVP.",
      },
      {
        question: "Will there be alcohol?",
        html: "No. All events are alcohol-free, and alcohol isn't permitted.",
      },
      {
        question: "Can I smoke or vape?",
        html: "No smoking or vaping inside any of the buildings. Discreet nicotine pouches are fine, but we encourage you to leave them elsewhere.",
      },
      {
        question: "Will there be food?",
        html: "Yes. We'll serve brunch right after the Ring Ceremony, and the Reception will feature a soup-and-chili bar.",
      },
      {
        question: "Can I take photos?",
        html: "Keep phones and cameras put away during the Ring Ceremony and the temple photos; our photographer has it covered. If you're joining photos with the Lord and Lady, empty your pockets and leave phones, keys, and other items with someone or somewhere safe. Feel free to snap away at the Reception.",
      },
      {
        question: "Do you have a registry?",
        html: 'Your presence is the greatest gift. If you’d like to give something, our registry is on <a href="https://www.amazon.com/wedding/share/HarrisonAndTabitha" target="_blank" rel="noopener noreferrer">Amazon</a>.',
      },
      {
        question: "Who do I contact with questions?",
        html: 'Harrison: <a href="tel:+16027625353">(602) 762-5353</a> or <a href="mailto:hdgraham99@gmail.com">hdgraham99@gmail.com</a>',
      },
    ],
  },

  registry: {
    blurbHtml: "Your presence is the greatest gift. If you'd like to give something, we're registered here:",
    links: [{ label: "Amazon", href: "https://www.amazon.com/wedding/share/HarrisonAndTabitha" }],
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
