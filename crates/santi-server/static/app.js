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

// Board drag and drop (D1): a drop posts the same move the "Move to…" form does; htmx swaps the board.
let dragged = null;
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
  if (dragged && event.target.closest("[data-column]")) event.preventDefault();
});
document.addEventListener("drop", (event) => {
  const column = event.target.closest("[data-column]");
  if (!dragged || !column) return;
  event.preventDefault();
  const cards = [...column.querySelectorAll("[data-key]")].filter((card) => card !== dragged);
  const next = cards.find((card) => {
    const box = card.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2;
  });
  const values = { column_id: column.dataset.column };
  if (next) values.before = next.dataset.key;
  else if (cards.length) values.after = cards[cards.length - 1].dataset.key;
  htmx.ajax("POST", dragged.dataset.move, { target: "#board", swap: "outerHTML", values });
});

// Refused moves come back as 409/422 with the board and its error; show them instead of dropping them.
document.addEventListener("htmx:beforeSwap", (event) => {
  if (event.detail.xhr.status === 409 || event.detail.xhr.status === 422) {
    event.detail.shouldSwap = true;
    event.detail.isError = false;
  }
});
