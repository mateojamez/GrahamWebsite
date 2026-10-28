import { WEDDING } from "./wedding-config.js";

function getPath(path) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), WEDDING);
}

/** Small element builder. Strings become text nodes, so config values are never parsed as HTML. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "html") el.innerHTML = value;
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child);
  }
  return el;
}

function applyPageTitle() {
  const titleEl = document.querySelector("title[data-wc-title]");
  if (!titleEl) return;
  const suffix = titleEl.getAttribute("data-wc-title");
  titleEl.textContent = `${WEDDING.couple.partnerA.first} & ${WEDDING.couple.partnerB.first} | ${suffix}`;
}

function applyText() {
  document.querySelectorAll("[data-wc]").forEach((el) => {
    const value = getPath(el.getAttribute("data-wc"));
    if (value != null) el.textContent = value;
  });
}

function applyAttrs() {
  document.querySelectorAll("[data-wc-attr]").forEach((el) => {
    el.getAttribute("data-wc-attr")
      .split(",")
      .forEach((pair) => {
        const [attr, path] = pair.split(":").map((s) => s.trim());
        const value = getPath(path);
        if (value != null) el.setAttribute(attr, value);
      });
  });
}

/** Hides elements whose config value is empty, for example the RSVP deadline before it's set. */
function applyConditionals() {
  document.querySelectorAll("[data-wc-if]").forEach((el) => {
    const value = getPath(el.getAttribute("data-wc-if"));
    el.hidden = value == null || value === "" || (Array.isArray(value) && value.length === 0);
  });
}

function renderEvent(event) {
  const { venue } = event;
  const hasVenue = venue && venue.name;
  const timeline = event.timeline ?? [];

  return h(
    "li",
    { class: "stem__event", id: `event-${event.slug}` },
    h(
      "p",
      { class: "stem__when" },
      h("time", { datetime: event.date.iso || null }, event.date.display),
      event.time ? h("span", { class: "stem__time" }, event.time) : null
    ),
    h("h3", { class: "stem__name" }, event.name),
    event.note ? h("p", { class: "stem__note" }, event.note) : null,
    hasVenue
      ? h(
          "address",
          { class: "stem__venue" },
          h("strong", {}, venue.name),
          venue.addressLine1 ? [h("br"), venue.addressLine1] : null,
          venue.addressLine2 ? [h("br"), venue.addressLine2] : null
        )
      : h("p", { class: "stem__pending" }, "Location coming soon"),
    timeline.length
      ? h(
          "ol",
          { class: "stem__timeline", "aria-label": `Schedule for the ${event.name.toLowerCase()}` },
          timeline.map((item) => h("li", {}, h("span", { class: "stem__timeline-time" }, item.time), " ", item.label))
        )
      : null
  );
}

function renderSchedule() {
  const root = document.querySelector("[data-wc-schedule]");
  if (!root) return;
  root.replaceChildren(...WEDDING.events.filter((e) => e.public).map(renderEvent));
}

function renderInfo() {
  const root = document.querySelector("[data-wc-info]");
  if (!root) return;
  const { dressCode, faqs } = WEDDING.info;

  const dress = h(
    "section",
    { class: "info-block", "aria-labelledby": "info-dress" },
    h("h2", { class: "info-block__title", id: "info-dress" }, "Dress code"),
    dressCode
      ? [h("p", { class: "info-block__lead" }, dressCode.label), h("div", { class: "prose", html: dressCode.html })]
      : h("p", { class: "stem__pending" }, "Dress code details coming soon")
  );

  const faq = h(
    "section",
    { class: "info-block", "aria-labelledby": "info-faq" },
    h("h2", { class: "info-block__title", id: "info-faq" }, "Good to know"),
    h(
      "div",
      { class: "faq-list" },
      faqs.map((item) =>
        h(
          "details",
          { class: "faq-item" },
          h("summary", { class: "faq-item__question" }, item.question),
          h("p", { class: "faq-item__answer", html: item.html })
        )
      )
    )
  );

  root.replaceChildren(dress, faq);
}

function renderRegistry() {
  const root = document.querySelector("[data-wc-registry]");
  if (!root) return;
  const { links, blurbHtml } = WEDDING.registry;

  root.replaceChildren(
    blurbHtml ? h("p", { class: "registry__blurb", html: blurbHtml }) : "",
    links.length
      ? h(
          "ul",
          { class: "registry__list" },
          links.map((link) =>
            h(
              "li",
              {},
              h(
                "a",
                { class: "registry__link", href: link.href, target: "_blank", rel: "noopener noreferrer" },
                link.label
              )
            )
          )
        )
      : h("p", { class: "stem__pending" }, "Registry links coming soon")
  );
}

const THEME_CSS_VARS = {
  colorVanilla: "--vanilla",
  colorGreen: "--green",
  colorSage: "--sage",
  colorLavender: "--lavender",
};

function applyTheme() {
  const theme = WEDDING.theme;
  if (!theme) return;
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(THEME_CSS_VARS)) {
    if (theme[key] != null) root.style.setProperty(cssVar, theme[key]);
  }
}

function init() {
  applyPageTitle();
  applyText();
  applyAttrs();
  applyConditionals();
  renderSchedule();
  renderInfo();
  renderRegistry();
  applyTheme();
}

init();
