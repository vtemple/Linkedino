/**
 * Runtime interactif du template Duo.
 *
 * Exporté en chaîne de JavaScript vanilla, pour deux raisons :
 *   - l'export autonome doit fonctionner sans React ni bundler ;
 *   - la page publique Next.js peut injecter exactement le même code, ce qui
 *     supprime tout risque de divergence entre ce que l'utilisateur voit sur
 *     le SaaS et ce qu'il obtient dans son fichier téléchargé.
 *
 * Contraintes tenues : aucune dépendance, dégradation propre sans JS (tout le
 * contenu reste lisible), et respect de `prefers-reduced-motion`.
 */

export function screenRuntime(): string {
  return `(function(){
  "use strict";
  var root = document.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Signale que le JavaScript prend en charge la révélation. Sans ce drapeau,
  // la CSS laisse tout visible : un échec de script ne peut pas rendre le CV
  // illisible. Le respect de prefers-reduced-motion passe par le même levier.
  if (!reduced) root.setAttribute("data-motion", "on");

  /* ── Divulgation des expériences ────────────────────────────────────
     Le prototype n'écoutait que \`mouseenter\` : inaccessible au tactile et
     au clavier. Ici l'état est réel (aria-expanded), le survol n'est plus
     qu'une commodité de bureau. */
  var items = Array.prototype.slice.call(document.querySelectorAll("[data-xp]"));
  var pointerFine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var hoverTimer = null;

  function open(target) {
    items.forEach(function (item) {
      var isTarget = item === target;
      var toggle = item.querySelector("[data-xp-toggle]");
      if (toggle && toggle.disabled) return;
      item.setAttribute("data-open", isTarget ? "true" : "false");
      if (toggle) toggle.setAttribute("aria-expanded", isTarget ? "true" : "false");
    });
  }

  items.forEach(function (item) {
    var toggle = item.querySelector("[data-xp-toggle]");
    if (!toggle || toggle.disabled) return;

    toggle.addEventListener("click", function () {
      open(item.getAttribute("data-open") === "true" ? null : item);
    });

    if (pointerFine) {
      item.addEventListener("mouseenter", function () {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(function () { open(item); }, 90);
      });
      item.addEventListener("mouseleave", function () { clearTimeout(hoverTimer); });
    }
  });

  /* ── Révélation au scroll ───────────────────────────────────────────── */
  var reveals = document.querySelectorAll(".cv-reveal");
  if (reduced || !("IntersectionObserver" in window)) {
    Array.prototype.forEach.call(reveals, function (el) { el.classList.add("is-in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0 });
    Array.prototype.forEach.call(reveals, function (el) { io.observe(el); });

    // Filet de sécurité : au bout de trois secondes, tout ce qui n'a pas été
    // révélé le devient. Une animation ratée ne doit jamais rendre une section
    // définitivement invisible — l'impression et la copie de texte non plus.
    setTimeout(function () {
      Array.prototype.forEach.call(reveals, function (el) { el.classList.add("is-in"); });
      io.disconnect();
    }, 1400);
  }

  /* ── Thème ──────────────────────────────────────────────────────────── */
  var STORAGE_KEY = "cv-theme";
  function applyTheme(value) {
    root.setAttribute("data-theme", value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) { /* mode privé */ }
  }
  try {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) root.setAttribute("data-theme", saved);
  } catch (e) { /* ignoré */ }

  var themeBtn = document.querySelector("[data-cv-theme]");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
  }

  var printBtn = document.querySelector("[data-cv-print]");
  if (printBtn) printBtn.addEventListener("click", function () { window.print(); });

  /* ── Navigation mobile ──────────────────────────────────────────────── */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".cv-nav a"));
  if (navLinks.length && "IntersectionObserver" in window) {
    var sections = navLinks
      .map(function (link) { return document.querySelector(link.getAttribute("href")); })
      .filter(Boolean);

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (link) {
          link.setAttribute(
            "aria-current",
            link.getAttribute("href") === "#" + entry.target.id ? "true" : "false"
          );
        });
      });
    }, { rootMargin: "-20% 0px -70% 0px" });

    sections.forEach(function (section) { spy.observe(section); });
  }
})();`;
}
