(() => {
  const key = "syncedm-appearance";
  const valid = value => value === "light" || value === "dark";
  let mode = "light";
  try {
    const saved = localStorage.getItem(key);
    if (valid(saved)) mode = saved;
    else if (saved === "system") {
      mode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      localStorage.setItem(key, mode);
    }
  } catch (_) {}
  function apply() {
    const dark = mode === "dark";
    document.documentElement.dataset.theme = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#141522" : "#f7f7fa");
    document.querySelectorAll("[data-appearance]").forEach(control => {
      control.checked = dark;
    });
  }
  apply();
  document.addEventListener("DOMContentLoaded", apply);
  document.addEventListener("appearance-controls-added", apply);
  document.addEventListener("change", event => {
    if (!event.target.matches("[data-appearance]")) return;
    mode = event.target.checked ? "dark" : "light";
    try { localStorage.setItem(key, mode); } catch (_) {}
    apply();
  });
  window.addEventListener("storage", event => {
    if (event.key !== key) return;
    mode = valid(event.newValue) ? event.newValue : "light";
    apply();
  });
})();
