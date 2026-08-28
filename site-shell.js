"use strict";

ensureDesktopStyles();
ensureDarkModeStyles();

const PICKEL_SITE_VERSION = "v1.1";
const PICKEL_SITE_NAME = "Pickel Lab Toolkits";

const PICKEL_NAV_ITEMS = [
  { href: "/", label: "Home", match: "/" },
  { href: "/equipment-schedule.html", label: "Equipment", match: "/equipment-schedule.html" },
  { href: "/availability.html", label: "Availability", match: "/availability.html" },
  { href: "/meeting-schedule.html", label: "Meetings", match: "/meeting-schedule.html" },
];

function ensureDesktopStyles() {
  if (document.querySelector('link[data-pickel-desktop-styles="true"]')) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/desktop.css?v=1.1-20260827";
  link.dataset.pickelDesktopStyles = "true";
  document.head.appendChild(link);
}

function ensureDarkModeStyles() {
  if (document.querySelector('link[data-pickel-dark-mode-styles="true"]')) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/dark-mode.css?v=1.1-20260827";
  link.dataset.pickelDarkModeStyles = "true";
  document.head.appendChild(link);
}

class PickelSiteBanner extends HTMLElement {
  connectedCallback() {
    if (this.dataset.rendered === "true") return;
    this.dataset.rendered = "true";

    const currentPath = normalizePath(window.location.pathname);

    const header = document.createElement("header");
    header.className = "site-banner";

    const inner = document.createElement("div");
    inner.className = "site-banner-inner";

    const brand = document.createElement("a");
    brand.className = "site-brand";
    brand.href = "/";
    brand.setAttribute("aria-label", `${PICKEL_SITE_NAME} home`);

    const mark = document.createElement("span");
    mark.className = "site-brand-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "PL";

    const name = document.createElement("span");
    name.className = "site-brand-name";
    name.textContent = PICKEL_SITE_NAME;

    brand.append(mark, name);

    const nav = document.createElement("nav");
    nav.className = "site-nav";
    nav.setAttribute("aria-label", "Primary navigation");

    for (const item of PICKEL_NAV_ITEMS) {
      const link = document.createElement("a");
      link.className = "site-nav-link";
      link.href = item.href;
      link.textContent = item.label;

      if (currentPath === item.match) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      }

      nav.appendChild(link);
    }

    const actions = document.createElement("div");
    actions.className = "site-banner-actions";

    const logout = document.createElement("button");
    logout.className = "site-logout-button";
    logout.type = "button";
    logout.textContent = "Forget device";
    logout.addEventListener("click", handleGlobalLogout);

    actions.appendChild(logout);
    inner.append(brand, nav, actions);
    header.appendChild(inner);
    this.appendChild(header);
  }
}

class PickelSiteFooter extends HTMLElement {
  connectedCallback() {
    if (this.dataset.rendered === "true") return;
    this.dataset.rendered = "true";

    const footer = document.createElement("footer");
    footer.className = "site-footer";

    const inner = document.createElement("div");
    inner.className = "site-footer-inner";

    const credit = document.createElement("span");
    credit.textContent = "Developed by Junyi Lin · Pickel Lab";

    const version = document.createElement("span");
    version.className = "version-badge";
    version.textContent = PICKEL_SITE_VERSION;

    inner.append(credit, version);
    footer.appendChild(inner);
    this.appendChild(footer);
  }
}

async function handleGlobalLogout(event) {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Signing out...";

  try {
    await fetch("/api/auth", {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    });
  } catch (error) {
    console.error("Logout failed:", error);
  } finally {
    window.location.replace("/");
  }
}

function normalizePath(pathname) {
  if (!pathname || pathname === "/index.html") return "/";
  return pathname;
}

if (!customElements.get("pickel-site-banner")) {
  customElements.define("pickel-site-banner", PickelSiteBanner);
}

if (!customElements.get("pickel-site-footer")) {
  customElements.define("pickel-site-footer", PickelSiteFooter);
}
