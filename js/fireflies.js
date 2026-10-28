/**
 * A few fireflies drift over the title page once after it loads, then fade out.
 * Skipped entirely for visitors who ask for reduced motion.
 */
const COUNT = 14;

const field = document.querySelector("[data-fireflies]");
const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (field && !calm) {
  for (let i = 0; i < COUNT; i += 1) {
    const fly = document.createElement("span");
    fly.className = "firefly";
    const style = fly.style;
    style.left = `${5 + Math.random() * 90}%`;
    style.top = `${15 + Math.random() * 75}%`;
    style.setProperty("--dx", `${(Math.random() - 0.5) * 120}px`);
    style.setProperty("--dy", `${-30 - Math.random() * 90}px`);
    style.animationDelay = `${1.2 + Math.random() * 2.5}s`;
    style.animationDuration = `${5 + Math.random() * 3}s`;
    field.append(fly);
  }
  // Clear the field once the last firefly has faded.
  window.setTimeout(() => field.replaceChildren(), 11000);
}
