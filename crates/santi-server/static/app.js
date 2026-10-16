// Blocks a second submit while a plain form post is in flight.
document.addEventListener("submit", (event) => {
  const button = event.target.querySelector("button[type=submit]");
  if (!button) return;
  if (button.getAttribute("aria-busy") === "true") {
    event.preventDefault();
    return;
  }
  button.setAttribute("aria-busy", "true");
});

// Back/forward cache restores the busy state; clear it.
window.addEventListener("pageshow", () => {
  document.querySelectorAll("[aria-busy=true]").forEach((element) => element.removeAttribute("aria-busy"));
});
