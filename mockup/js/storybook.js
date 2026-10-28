/**
 * Storybook mockup renderer. Reads the same WEDDING config as the live site and
 * renders the mockup's own markup into [data-sb-*] hooks. Text bindings
 * ([data-wc]) and page titles come from js/apply-wedding-config.js.
 */
import { WEDDING } from "../../js/wedding-config.js";

/** Small element builder. Strings become text nodes; only `html` is parsed. */
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

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

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
        : h("p", { class: "chapter__pending" }, "Location coming soon")
    )
  );
}

function renderChapters() {
  const root = document.querySelector("[data-sb-chapters]");
  if (!root) return;
  root.replaceChildren(...WEDDING.events.filter((e) => e.public).map(renderChapter));
}

function renderDressCode() {
  const root = document.querySelector("[data-sb-dress]");
  if (!root) return;
  const { dressCode } = WEDDING.info;
  root.replaceChildren(
    ...(dressCode
      ? [h("p", { class: "lead" }, dressCode.label), h("div", { class: "prose", html: dressCode.html })]
      : [h("p", { class: "chapter__pending" }, "Dress code details coming soon")])
  );
}

function renderFaqs() {
  const root = document.querySelector("[data-sb-faqs]");
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
  const root = document.querySelector("[data-sb-registry]");
  if (!root) return;
  const { blurbHtml, links } = WEDDING.registry;
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
              h("a", { class: "button", href: link.href, target: "_blank", rel: "noopener noreferrer" }, `Open our ${link.label} registry`)
            )
          )
        )
      : h("p", { class: "chapter__pending" }, "Registry links coming soon")
  );
}

renderChapters();
renderDressCode();
renderFaqs();
renderRegistry();
