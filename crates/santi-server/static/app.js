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

// Drag and drop (D1): a drop on a board column or a backlog section posts the same move
// the "Move to…" form does; htmx swaps the board or the backlog.
let dragged = null;
const zoneOf = (target) => target.closest?.("[data-column],[data-sprint]");
document.addEventListener("dragstart", (event) => {
  dragged = event.target.closest?.("[data-key]");
  if (!dragged) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", dragged.dataset.key);
  dragged.classList.add("dragging");
});
document.addEventListener("dragend", () => {
  dragged?.classList.remove("dragging");
  dragged = null;
});
document.addEventListener("dragover", (event) => {
  if (dragged && zoneOf(event.target)) event.preventDefault();
});
document.addEventListener("drop", (event) => {
  const zone = zoneOf(event.target);
  if (!dragged || !zone) return;
  event.preventDefault();
  const cards = [...zone.querySelectorAll("[data-key]")].filter((card) => card !== dragged);
  const next = cards.find((card) => {
    const box = card.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2;
  });
  const onBoard = zone.dataset.column !== undefined;
  const values = onBoard ? { column_id: zone.dataset.column } : { sprint: zone.dataset.sprint };
  if (next) values.before = next.dataset.key;
  else if (cards.length) values.after = cards[cards.length - 1].dataset.key;
  htmx.ajax("POST", dragged.dataset.move, { target: onBoard ? "#board" : "#backlog", swap: "outerHTML", values });
});

// Refused moves come back as 409/422 with the board and its error; show them instead of dropping them.
document.addEventListener("htmx:beforeSwap", (event) => {
  if (event.detail.xhr.status === 409 || event.detail.xhr.status === 422) {
    event.detail.shouldSwap = true;
    event.detail.isError = false;
  }
});
