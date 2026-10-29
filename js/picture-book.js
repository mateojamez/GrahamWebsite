/**
 * The picture book on the home page: the cover, then a page per photo.
 * The arrows, the keyboard arrow keys, and a sideways swipe turn the pages.
 * A turning page swings on the spine (left edge); with reduced motion it swaps instantly.
 */
const book = document.querySelector("[data-book]");
// Matches the page-away and page-back animations in css/styles.css.
const TURN_MS = 750;

if (book) {
  const leaves = [...book.querySelectorAll("[data-leaf]")];
  const prev = book.querySelector("[data-book-prev]");
  const next = book.querySelector("[data-book-next]");
  const status = document.querySelector("[data-book-status]");
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pageCount = leaves.length - 1;

  let current = 0;
  let turning = false;

  // Only the open page is exposed to screen readers and the keyboard.
  const expose = (leaf, open) => {
    leaf.inert = !open;
    leaf.setAttribute("aria-hidden", String(!open));
  };
  leaves.forEach((leaf, i) => expose(leaf, i === 0));

  // Start loading the photos on the next page, so they're ready when the page turns.
  const preload = (index) => {
    leaves[index]?.querySelectorAll("img").forEach((img) => {
      img.loading = "eager";
    });
  };
  preload(1);

  const update = () => {
    prev.disabled = current === 0;
    next.disabled = current === pageCount;
    status.textContent =
      current === 0 ? "Turn the page for more of the story" : `Page ${current} of ${pageCount}`;
  };

  const finish = (from, to) => {
    leaves[from].classList.remove("is-current", "is-turning-away", "is-under");
    leaves[to].classList.remove("is-turning-back");
    expose(leaves[from], false);
    expose(leaves[to], true);
    current = to;
    turning = false;
    preload(to + 1);
    update();
  };

  const turnTo = (to) => {
    if (turning || to < 0 || to > pageCount || to === current) return;
    const from = current;
    leaves[to].classList.add("is-current");
    // The cover's decals fade as soon as the book opens and return when it closes.
    book.classList.toggle("is-open", to !== 0);
    // Lets the dragon fly back to the cover without replaying its fly-back on page load.
    if (to !== 0) book.classList.add("has-opened");

    if (calm.matches) {
      finish(from, to);
      return;
    }

    turning = true;
    // Forward: the open page swings away and reveals the next one beneath it.
    // Back: the earlier page swings back over the open one.
    const mover = to > from ? leaves[from] : leaves[to];
    if (to > from) {
      leaves[from].classList.add("is-turning-away");
    } else {
      leaves[from].classList.add("is-under");
      leaves[to].classList.add("is-turning-back");
    }
    // Finish on the turn's own animationend (the cover's text has load animations of its
    // own), with a timer as a backstop in case the event never arrives.
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      mover.removeEventListener("animationend", onEnd);
      finish(from, to);
    };
    const onEnd = (event) => {
      if (event.target === mover) end();
    };
    mover.addEventListener("animationend", onEnd);
    window.setTimeout(end, TURN_MS + 150);
  };

  prev.addEventListener("click", () => turnTo(current - 1));
  next.addEventListener("click", () => turnTo(current + 1));

  book.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") turnTo(current - 1);
    if (event.key === "ArrowRight") turnTo(current + 1);
  });

  // A sideways swipe of 40px or more turns the page.
  let startX = null;
  book.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse") startX = event.clientX;
  });
  book.addEventListener("pointerup", (event) => {
    if (startX == null) return;
    const dx = event.clientX - startX;
    startX = null;
    if (Math.abs(dx) >= 40) turnTo(current + (dx < 0 ? 1 : -1));
  });

  update();
}
