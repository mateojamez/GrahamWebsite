/**
 * Passes the schedule's height to the photo frame beside it, so the frame can match
 * that height while its width follows the photo's 2:3 shape. CSS alone can't size a
 * width from a stretched height. Without this script the frame uses a fixed height.
 */
const list = document.querySelector(".chapters__columns > .chapter-list");
const art = document.querySelector(".chapters__art");

if (list && art) {
  new ResizeObserver(() => {
    art.style.setProperty("--schedule-height", `${list.offsetHeight}px`);
  }).observe(list);
}
