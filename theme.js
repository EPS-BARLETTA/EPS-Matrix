(function(){
  const STORAGE_KEY = "eps.matrix.theme";
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initial = localStorage.getItem(STORAGE_KEY) || (prefersDark ? "dark" : "light");
  document.documentElement.dataset.theme = initial;

  function applyTheme(value){
    const theme = value === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
    updateToggle(theme);
  }

  function toggleTheme(){
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
  }

  function updateToggle(theme){
    document.querySelectorAll(".themeToggle").forEach((btn)=>{
      const isDark = theme === "dark";
      btn.textContent = isDark ? "☀️" : "🌙";
      btn.setAttribute("aria-label", isDark ? "Passer en mode clair" : "Passer en mode nuit");
    });
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    updateToggle(document.documentElement.dataset.theme || "light");
    document.querySelectorAll(".themeToggle").forEach((btn)=>{
      btn.addEventListener("click", (event)=>{
        event.preventDefault();
        toggleTheme();
      });
    });
  });

  window.EPSTheme = {apply: applyTheme, toggle: toggleTheme};
})();
