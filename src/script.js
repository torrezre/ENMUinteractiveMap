/* eslint-disable no-undef */

// Config map
const config = {
  minZoom: 7,
  maxZoom: 18,
};

// Magnification with which the map will start
const zoom = 18;

// Coordinates
const lat = 34.17735;
const lng = -103.34862;

// Initialize map
const map = L.map("map", config).setView([lat, lng], zoom);

// Deep linking + shared state
let placesData = [];
const markersById = new Map();
let activePlaceId = null;
let pendingPlaceId = null;

// Category browse/filter UI state
let activeCategory = "all";
const markersLayer = L.layerGroup().addTo(map);
let allMarkers = [];

// Category helpers 
function normalizeCategory(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, "-")
    .replace(/\//g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function categoryKey(raw) {
  const key = normalizeCategory(raw);

  // Canonical keys (normalized JSON)
  if (key === "administration") return "administration";
  if (key === "academic") return "academic";
  if (key === "athletics") return "athletics";
  if (key === "student-services") return "student-services";
  if (key === "housing") return "housing";
  if (key === "landmarks") return "landmarks";
  if (key === "other" || key === "") return "other";
}

const CATEGORY_LABELS = {
  administration: "Administration",
  academic: "Academic",
  athletics: "Athletics & Recreation",
  "student-services": "Student Services",
  housing: "Housing",
  landmarks: "Landmarks & Museums",
  other: "Other",
};

// Inline SVG icons
const CATEGORY_ICONS = {
  administration: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3 3 8v2h18V8L12 3zm-7 9v7h3v-7H5zm5 0v7h4v-7h-4zm6 0v7h3v-7h-3zM3 21h18v-2H3v2z"/></svg>`,
  academic: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3 1 9l11 6 9-4.91V17h2V9L12 3zm-7 9.2V16c0 2.21 3.13 4 7 4s7-1.79 7-4v-3.8l-7 3.8-7-3.8z"/></svg>`,
  athletics: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2zm6.93 9h-3.11a14.6 14.6 0 0 0-1.02-4.06A8.03 8.03 0 0 1 18.93 11zM12 4c.86 1.14 1.72 3.2 2.1 7H9.9C10.28 7.2 11.14 5.14 12 4zM4.07 13h3.11c.2 1.44.6 2.84 1.02 4.06A8.03 8.03 0 0 1 4.07 13zm3.11-2H4.07a8.03 8.03 0 0 1 4.13-4.06c-.42 1.22-.82 2.62-1.02 4.06zM12 20c-.86-1.14-1.72-3.2-2.1-7h4.2c-.38 3.8-1.24 5.86-2.1 7zm3.8-2.94c.42-1.22.82-2.62 1.02-4.06h3.11a8.03 8.03 0 0 1-4.13 4.06z"/></svg>`,
  "student-services": `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a7 7 0 0 0-4 12.75V22l4-2 4 2v-7.25A7 7 0 0 0 12 2zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/></svg>`,
  housing: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3 2 12h3v9h6v-6h2v6h6v-9h3L12 3z"/></svg>`,
  landmarks: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 2h12v2H6V2zm2 4h8v2H8V6zm-2 4h12v12H6V10zm2 2v8h8v-8H8z"/></svg>`,
  other: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm1 15h-2v-2h2v2zm0-4h-2a4 4 0 1 1 2 0z"/></svg>`,
};

function announce(text) {
  const el = document.getElementById("sr-announcer");
  if (!el) return;
  // Clearing first ensures repeated announcements still fire
  el.textContent = "";
  window.setTimeout(() => {
    el.textContent = text;
  }, 10);
}

// Deep link helpers (#place=ID)
function parsePlaceIdFromHash() {
  const h = (window.location.hash || "").replace(/^#/, "");
  const m = h.match(/(?:^|&)place=(\d+)(?:$|&)/);
  return m ? Number(m[1]) : null;
}

function setPlaceIdHash(id) {
  const newHash = `#place=${id}`;
  if (window.location.hash === newHash) return;
  history.replaceState(null, "", newHash);
}

function clearPlaceHash() {
  if (!window.location.hash) return;
  history.replaceState(null, "", "#");
}

function openPlace(id, opts = {}) {
  const { updateHash = true, flyTo = true } = opts;
  if (!placesData || placesData.length === 0) {
    pendingPlaceId = id;
    return;
  }
  const place = placesData.find((p) => Number(p.id) === Number(id));
  if (!place) return;

  activePlaceId = Number(id);
  document.body.classList.add("active-sidebar");
  addContentToSidebar(place);
  announce(`Opened details for ${place.title}. Map ${place.id}.`);

  // Focus sidebar for accessibility
  const sidebarEl = document.querySelector(".sidebar");
  sidebarEl?.focus?.();

  // Keep map centered on the selection
  if (flyTo && place.coords) {
    boundsMap(place.coords);
    // Ensure the home button reflects non-default view immediately
    updateHomeButtonVisibility();
  }

  if (updateHash) {
    setPlaceIdHash(place.id);
  }
}

function handleHash() {
  const id = parsePlaceIdFromHash();
  if (id != null) {
    openPlace(id, { updateHash: false, flyTo: true });
  }
}

// Function to create tile layer
function addTileLayer() {
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
}

// Fetch JSON data
async function fetchData(url) {
  try {
    const response = await fetch(url);
    return await response.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

// Add markers to map
async function addMarkers() {
  const data = await fetchData("./places.json");
  placesData = Array.isArray(data) ? data : [];
  const featureGroups = [];
  const latlngs = [];

  data.forEach((marker) => {
    const { coords, id, title, category } = marker;
    const cat = categoryKey(category);
    const m = L.marker(coords, {
      icon: L.divIcon({
        className: "leaflet-marker-icon",
        html: `<div class="marker marker--${cat}" role="img" aria-label="${title} (Map ${id})"><div class="marker__icon">${CATEGORY_ICONS[cat] || CATEGORY_ICONS.other}</div><div class="marker__badge">${id}</div></div>`,
        iconSize: L.point(36, 36),
        popupAnchor: [3, -5],
      }),
      "marker-options-id": id,
    });
    featureGroups.push(m);
    markersById.set(id, m);
    // Marker click: open sidebar for this place
    m.on("click", () => openPlace(id));
    latlngs.push(coords);
  });

  // Add all markers to a dedicated layer (enables filtering)
  allMarkers = featureGroups.slice();
  featureGroups.forEach((marker) => {
    markersLayer.addLayer(marker);
  });

  const groupBounds = new L.featureGroup(featureGroups);
  map.fitBounds(groupBounds.getBounds(), {
    padding: [50, 50],
  });

  // Build category browse UI once data is available
  initCategoryBrowse();

  // If a deep link was requested before data loaded, open it now
  if (pendingPlaceId != null) {
    const idToOpen = pendingPlaceId;
    pendingPlaceId = null;
    openPlace(idToOpen, { updateHash: false, flyTo: true });
  }
}

// Close sidebar
function closeSidebar() {
  document.body.classList.remove("active-sidebar");
  announce("Closed building details.");
  // Clear deep link when closing the active place
  if (activePlaceId != null) {
    activePlaceId = null;
    clearPlaceHash();
  }
}

// Add content to sidebar
function addContentToSidebar(marker) {
  const { id, title, small, description, img, coords } = marker;
  const smallInfo = small ? `<small>${small}</small>` : "";
  const imgHtml =
    img && img.src
      ? `<img class="img-zoom" src="${img.src}" alt="${img.alt || title}">`
      : "";

  const sidebarTemplate = `
    <article class="sidebar-content">
      <h1>${title}</h1>
      <div class="marker-id">${id}</div>
      <div class="info-content">
        ${imgHtml}
        ${smallInfo}
        <div class="info-description">${description}</div>
      </div>
    </article>
  `;

  const sidebar = document.querySelector(".sidebar");
  const sidebarContent = document.querySelector(".sidebar-content");
  sidebarContent?.remove();
  sidebar.insertAdjacentHTML("beforeend", sidebarTemplate);
}

// Bounds map when sidebar is open
function boundsMap(coords) {
  const sidebarWidth = document.querySelector(".sidebar").offsetWidth || 0;
  const marker = L.marker(coords);
  const group = L.featureGroup([marker]);
  const bounds = coords ? group.getBounds() : map.getBounds();
  map.fitBounds(bounds, {
    paddingTopLeft: [sidebarWidth, 10],
  });
}

// Event listeners
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    closeSidebar();
  }
});

const buttonClose = document.querySelector(".close-button");
buttonClose.addEventListener("click", closeSidebar);

document.addEventListener("click", (e) => {
  const target = e.target;
  if (!target.closest(".sidebar") && !target.closest(".leaflet-marker-icon") && !target.closest(".filter-panel")) {
    closeSidebar();
  }
});

// Home button
const homeButtonTemplate =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M32 18.451L16 6.031 0 18.451v-5.064L16 .967l16 12.42zM28 18v12h-8v-8h-8v8H4V18l12-9z" /></svg>';

const homeButtonControl = L.Control.extend({
  options: {
    position: "topleft",
  },

  onAdd: function () {
    const btn = L.DomUtil.create("button");
    btn.title = "Back to home";
    btn.innerHTML = homeButtonTemplate;
    btn.className += "leaflet-bar back-to-home hidden";
    return btn;
  },
});

map.addControl(new homeButtonControl());

const buttonBackToHome = document.querySelector(".back-to-home");
// Initialize home button state
updateHomeButtonVisibility();
buttonBackToHome.addEventListener("click", () => {
  map.flyTo([lat, lng], zoom);
  // Immediately reflect UI state (moveend will also run)
  updateHomeButtonVisibility();
});

function updateHomeButtonVisibility() {
  const { lat: latCenter, lng: lngCenter } = map.getCenter();
  const latC = latCenter.toFixed(3) * 1;
  const lngC = lngCenter.toFixed(3) * 1;
  const defaultCoordinate = [+lat.toFixed(3), +lng.toFixed(3)];
  const centerCoordinate = [latC, lngC];
  if (JSON.stringify(centerCoordinate) === JSON.stringify(defaultCoordinate)) {
    buttonBackToHome.classList.add("hidden");
  } else {
    buttonBackToHome.classList.remove("hidden");
  }
}

map.on("moveend", updateHomeButtonVisibility);



// Category browse control (filters markers + shows a tap list)
let categoryControl = null;

function initCategoryBrowse() {
  // Avoid double-init if addMarkers is called again
  if (categoryControl) return;

  categoryControl = L.control({ position: "topright" });
  categoryControl.onAdd = function () {
    const div = L.DomUtil.create("div", "filter-panel");
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);

    div.innerHTML = `
      <div class="filter-panel__header">
        <div class="filter-panel__title">Browse</div>
        <button type="button" class="filter-panel__clear" aria-label="Show all categories">All</button>
      </div>

      <div class="filter-chips" role="group" aria-label="Filter by category">
        ${["all", ...Object.keys(CATEGORY_LABELS)]
          .map((k) => {
            if (k === "all") {
              return `<button type="button" class="filter-chip is-active" data-category="all" aria-pressed="true">All</button>`;
            }
            return `
              <button type="button" class="filter-chip" data-category="${k}" aria-pressed="false">
                <span class="legend-swatch marker marker--${k}" aria-hidden="true" style="width:22px;height:22px;">
                  <span class="marker__icon" style="transform:scale(0.9);">${CATEGORY_ICONS[k] || CATEGORY_ICONS.other}</span>
                </span>
                <span class="filter-chip__label">${CATEGORY_LABELS[k]}</span>
              </button>
            `;
          })
          .join("")}
      </div>

      <div class="place-list" aria-label="Places list"></div>
    `;

    // Wire events (event delegation)
    div.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      if (btn.classList.contains("filter-panel__clear")) {
        setActiveCategory("all");
        return;
      }

      if (btn.classList.contains("filter-chip")) {
        const cat = btn.getAttribute("data-category") || "all";
        setActiveCategory(cat);
        return;
      }

      if (btn.classList.contains("place-item")) {
        const id = Number(btn.getAttribute("data-id"));
        if (!Number.isNaN(id)) openPlace(id);
      }
    });

    // Initial render
    renderCategoryList();
    return div;
  };

  categoryControl.addTo(map);
}

function setActiveCategory(cat) {
  activeCategory = cat || "all";

  // Update chip pressed states
  const container = document.querySelector(".filter-panel");
  if (container) {
    container.querySelectorAll(".filter-chip").forEach((b) => {
      const isActive = (b.getAttribute("data-category") || "all") === activeCategory;
      b.setAttribute("aria-pressed", isActive ? "true" : "false");
      b.classList.toggle("is-active", isActive);
    });
  }

  applyCategoryFilter();
  renderCategoryList();

  if (activeCategory === "all") {
    announce("Showing all categories.");
  } else {
    announce(`Filtered to ${CATEGORY_LABELS[activeCategory] || "selected category"}.`);
  }
}

function applyCategoryFilter() {
  markersLayer.clearLayers();

  if (activeCategory === "all") {
    allMarkers.forEach((m) => markersLayer.addLayer(m));
    return;
  }

  allMarkers.forEach((m) => {
    const id = m.options["marker-options-id"];
    const place = placesData.find((p) => Number(p.id) === Number(id));
    const cat = categoryKey(place?.category);
    if (cat === activeCategory) markersLayer.addLayer(m);
  });
}

function renderCategoryList() {
  const panel = document.querySelector(".filter-panel");
  if (!panel) return;
  const listEl = panel.querySelector(".place-list");
  if (!listEl) return;

  const rows = placesData
    .filter((p) => (activeCategory === "all" ? true : categoryKey(p.category) === activeCategory))
    .slice()
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((p) => {
      const cat = categoryKey(p.category);
      return `
        <button type="button" class="place-item" data-id="${p.id}">
          <span class="place-item__badge">${p.id}</span>
          <span class="place-item__title">${p.title}</span>
          <span class="place-item__cat">${CATEGORY_LABELS[cat] || "Other"}</span>
        </button>
      `;
    })
    .join("");

  listEl.innerHTML = rows || `<div class="place-list__empty">No places in this category.</div>`;
}

// Legend
const legend = L.control({ position: "bottomleft" });

legend.onAdd = function () {
  const div = L.DomUtil.create("div", "description");
  L.DomEvent.disableClickPropagation(div);
  div.innerHTML = `
    <b>ENMU Interactive Map</b>
    <p>Tap a marker to see details. Use the home button to return to the ENMU campus.</p>
    <p><b>Marker key</b></p>
    <ul style="margin: 0 0 0 16px; padding: 0;">
      <li><span style="font-weight:700;">●</span> Icon = category</li>
      <li><span style="font-weight:700;">#</span> Badge = printed map number</li>
    </ul>
    <p style="margin-top:8px;"><b>Categories</b></p>
    <div class="legend-grid">
      ${Object.keys(CATEGORY_LABELS)
        .map(
          (k) => `
        <div class="legend-item">
          <span class="legend-swatch marker marker--${k}" aria-hidden="true" style="width:22px;height:22px;">
            <span class="marker__icon" style="transform:scale(0.9);">${CATEGORY_ICONS[k]}</span>
          </span>
          <span>${CATEGORY_LABELS[k]}</span>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
  return div;
};

legend.addTo(map);

// Initial setup
addTileLayer();
addMarkers();

// Deep linking: open a place from the URL hash, and react to changes
handleHash();
window.addEventListener("hashchange", handleHash);
