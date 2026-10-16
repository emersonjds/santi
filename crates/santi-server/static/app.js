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
// The dashed slot shows where the dragged card would land.
const slot = document.createElement("li");
slot.className = "drop-slot";
const nextCard = (zone, y) =>
  [...zone.querySelectorAll("[data-key]")].filter((card) => card !== dragged).find((card) => {
    const box = card.getBoundingClientRect();
    return y < box.top + box.height / 2;
  });
document.addEventListener("dragend", () => {
  dragged?.classList.remove("dragging");
  dragged = null;
  slot.remove();
});
document.addEventListener("dragover", (event) => {
  const zone = zoneOf(event.target);
  if (!dragged || !zone) return;
  event.preventDefault();
  const list = zone.querySelector("ul");
  const next = nextCard(zone, event.clientY);
  if (list && (slot.parentNode !== list || slot.nextElementSibling !== (next ?? null))) list.insertBefore(slot, next ?? null);
});
document.addEventListener("drop", (event) => {
  const zone = zoneOf(event.target);
  if (!dragged || !zone) return;
  event.preventDefault();
  slot.remove();
  const cards = [...zone.querySelectorAll("[data-key]")].filter((card) => card !== dragged);
  const next = nextCard(zone, event.clientY);
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

// Issue and create dialogs (D1): htmx loads the body, then the dialog opens. Issues push their URL,
// so a reload lands on the full page; closing steps back to the board.
const dialog = document.getElementById("dialog");
let pushed = false;
document.addEventListener("htmx:afterSwap", (event) => {
  if (!dialog || event.detail.target.id !== "dialog-body") return;
  if (!dialog.open) dialog.showModal();
  const link = event.detail.requestConfig.elt;
  if (link.hasAttribute("data-push")) {
    history[pushed ? "replaceState" : "pushState"](null, "", link.getAttribute("href"));
    pushed = true;
  }
});
dialog?.addEventListener("close", () => {
  document.getElementById("dialog-body").replaceChildren();
  if (pushed) {
    pushed = false;
    history.back();
  }
});
dialog?.addEventListener("click", (event) => {
  if (event.target === dialog || event.target.closest("[data-close]")) dialog.close();
});
window.addEventListener("popstate", () => {
  if (!dialog?.open) return;
  pushed = false;
  dialog.close();
});

// The project picker of the create form reloads it for the chosen project.
document.addEventListener("change", (event) => {
  if (!event.target.matches("[data-switch-project]")) return;
  const url = `/p/${event.target.value}/issues/new`;
  if (dialog?.open) htmx.ajax("GET", url, { target: "#dialog-body" });
  else location.assign(url);
});

// "c" opens Create, unless the user is typing.
document.addEventListener("keydown", (event) => {
  if (event.key !== "c" || event.metaKey || event.ctrlKey || event.altKey || dialog?.open) return;
  if (event.target.closest("input, textarea, select, [contenteditable]")) return;
  event.preventDefault();
  document.getElementById("create")?.click();
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  navigator.clipboard?.writeText(button.dataset.copy);
  button.querySelector("span").textContent = "Copied";
});
