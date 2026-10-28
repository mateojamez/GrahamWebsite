/** Marks the header once the page leaves the top, so CSS can draw its contents to the center. */
const header = document.querySelector(".site-header");

if (header) {
  const update = () => header.classList.toggle("is-scrolled", window.scrollY > 0);
  update();
  window.addEventListener("scroll", update, { passive: true });
}
