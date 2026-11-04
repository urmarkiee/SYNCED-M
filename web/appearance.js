(() => {
  const key = "syncedm-appearance";
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const valid = value => ["light", "dark", "system"].includes(value);
  let mode = "system";
  try { const saved = localStorage.getItem(key); if (valid(saved)) mode = saved; } catch (_) {}
  function apply() {
    const dark = mode === "dark" || (mode === "system" && system.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#141522" : "#f7f7fa");
    document.querySelectorAll("[data-appearance]").forEach(select => { select.value = mode; });
  }
  apply();
  document.addEventListener("DOMContentLoaded", apply);
  document.addEventListener("appearance-controls-added", apply);
  document.addEventListener("change", event => {
    if (!event.target.matches("[data-appearance]") || !valid(event.target.value)) return;
    mode = event.target.value;
    try { localStorage.setItem(key, mode); } catch (_) {}
    apply();
  });
  system.addEventListener("change", apply);
  window.addEventListener("storage", event => {
    if (event.key !== key) return;
    mode = valid(event.newValue) ? event.newValue : "system";
    apply();
  });
})();
