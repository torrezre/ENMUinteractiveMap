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
  const featureGroups = [];
  const latlngs = [];

  data.forEach((marker) => {
    const { coords, id } = marker;
    featureGroups.push(
      L.marker(coords, {
        icon: L.divIcon({
          className: "leaflet-marker-icon",
          html: `${id}`,
          iconSize: L.point(30, 30),
          popupAnchor: [3, -5],
        }),
        "marker-options-id": id,
      })
    );
    latlngs.push(coords);
  });

  featureGroups.forEach((marker) => {
    marker.addTo(map);
  });

  const groupBounds = new L.featureGroup(featureGroups);
  map.fitBounds(groupBounds.getBounds(), {
    padding: [50, 50],
  });

  groupBounds.on("click", function (e) {
    if (e.layer instanceof L.Marker) {
      showSidebarWidthText(e.layer.options["marker-options-id"]);
    }
  });

  function showSidebarWidthText(id) {
    const marker = data.find((marker) => marker.id === id);
    if (marker) {
      document.body.classList.add("active-sidebar");
      addContentToSidebar(marker);
    }
  }
}

// Close sidebar
function closeSidebar() {
  document.body.classList.remove("active-sidebar");
}

// Add content to sidebar
function addContentToSidebar(marker) {
  const { id, title, small, description, img, coords } = marker;
  const smallInfo = small ? `<small>${small}</small>` : "";

  const sidebarTemplate = `
    <article class="sidebar-content">
      <h1>${title}</h1>
      <div class="marker-id">${id}</div>
      <div class="info-content">
        <img class="img-zoom" src="${img.src}" alt="${img.alt}">
        ${smallInfo}
        <div class="info-description">${description}</div>
      </div>
    </article>
  `;

  const sidebar = document.querySelector(".sidebar");
  const sidebarContent = document.querySelector(".sidebar-content");
  sidebarContent?.remove();
  sidebar.insertAdjacentHTML("beforeend", sidebarTemplate);
  boundsMap(coords);
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
  if (!target.closest(".sidebar") && !target.classList.contains("leaflet-marker-icon")) {
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
buttonBackToHome.addEventListener("click", () => {
  map.flyTo([lat, lng], zoom);
});

map.on("moveend", () => {
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
});

// Legend
const legend = L.control({ position: "bottomleft" });

legend.onAdd = function () {
  const div = L.DomUtil.create("div", "description");
  L.DomEvent.disableClickPropagation(div);
  div.innerHTML = "<b>ENMU Interactive Map</b><p>Use the home button to return to the ENMU campus";
  return div;
};

legend.addTo(map);

// Initial setup
addTileLayer();
addMarkers();