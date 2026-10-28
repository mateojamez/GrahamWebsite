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

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

/** One event, rendered as a numbered chapter of the day. */
function renderChapter(event, index) {
  const { venue } = event;
  return h(
    "li",
    { class: "chapter", id: `event-${event.slug}` },
    h("span", { class: "chapter__num", "aria-hidden": "true" }, ROMAN[index] ?? String(index + 1)),
    h(
      "div",
      { class: "chapter__body" },
      h(
        "p",
        { class: "chapter__when" },
        h("time", { datetime: event.date.iso || null }, event.date.display),
        event.time ? h("span", { class: "chapter__time" }, event.time) : null
      ),
      h("h3", { class: "chapter__name" }, event.name),
      event.note ? h("p", { class: "chapter__note" }, event.note) : null,
      venue && venue.name
        ? h(
            "address",
            { class: "chapter__venue" },
            h("strong", {}, venue.name),
            venue.addressLine1 ? [h("br"), venue.addressLine1] : null,
            venue.addressLine2 ? [h("br"), venue.addressLine2] : null
          )
        : h("p", { class: "pending" }, "Location coming soon")
    )
  );
}

function renderSchedule() {
  const root = document.querySelector("[data-wc-schedule]");
  if (!root) return;
  root.replaceChildren(...WEDDING.events.filter((e) => e.public).map(renderChapter));
}

function renderDressCode() {
  const root = document.querySelector("[data-wc-dress]");
  if (!root) return;
  const { dressCode } = WEDDING.info;
  root.replaceChildren(
    ...(dressCode
      ? [h("p", { class: "lead" }, dressCode.label), h("div", { class: "prose", html: dressCode.html })]
      : [h("p", { class: "pending" }, "Dress code details coming soon")])
  );
}

function renderFaqs() {
  const root = document.querySelector("[data-wc-faqs]");
  if (!root) return;
  root.replaceChildren(
    ...WEDDING.info.faqs.map((item) =>
      h(
        "details",
        { class: "faq" },
        h("summary", { class: "faq__q" }, item.question),
        h("p", { class: "faq__a", html: item.html })
      )
    )
  );
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
          { class: "registry__links" },
          links.map((link) =>
            h(
              "li",
              {},
              h(
                "a",
                { class: "button", href: link.href, target: "_blank", rel: "noopener noreferrer" },
                `Open our ${link.label} registry`
              )
            )
          )
        )
      : h("p", { class: "pending" }, "Registry links coming soon")
  );
}

const THEME_CSS_VARS = {
  colorVellum: "--vellum",
  colorInk: "--ink",
  colorSage: "--sage",
  colorLavender: "--lavender",
  colorGilt: "--gilt",
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
  renderDressCode();
  renderFaqs();
  renderRegistry();
  applyTheme();
}

init();
