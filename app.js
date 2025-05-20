// Refactored for better code structure, formatting, and SOLID-like principles.
// Functionality remains unchanged.

// ===================== GLOBAL STATE ===================== //
let map;
let markers = {};
let circles = {};
let selectedPosition = null;
let editingMarkerId = null;
let debounceTimer;
//let baseUri = "https://marker-0bvl.onrender.com";
let baseUri = "http://129.159.224.245:8000";
let roomConfig = {};
let highlightCircle;

// ===================== INITIALIZATION ===================== //
function initMap() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get("room");

  if (!roomId) {
    alert("No room specified. Redirecting to home page.");
    window.location.href = "index.html";
    return;
  }

  loadRoomConfig(roomId).then(() => {

    if(!roomConfig.extraFieldsAllowed){
        document.getElementById("add-field").classList.add("hidden");
    }

    setupMap();
    setupListeners();
    loadMarkers();
  });
}

function setupMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: roomConfig.defaultLocation,
    zoom: roomConfig.zoom,
  });

  const input = document.getElementById("pac-input");
  const searchBox = new google.maps.places.SearchBox(input);

  map.addListener("bounds_changed", () => {
    searchBox.setBounds(map.getBounds());
  });

  searchBox.addListener("places_changed", () => {
    const places = searchBox.getPlaces();
    if (places.length === 0 || !places[0].geometry) return;
  
    const location = places[0].geometry.location;
    map.panTo(location);
    map.setZoom(50);
  
    // Remove previous highlight
    if (highlightCircle) {
      highlightCircle.setMap(null);
    }
  
    // Draw new circle
    highlightCircle = new google.maps.Circle({
      strokeColor: "#4285F4",
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: "#4285F4",
      fillOpacity: 0.35,
      map,
      center: location,
      radius: 20, // meters
    });
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        map.setCenter({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        map.setZoom(20);

        const userPos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        const marker = new google.maps.Marker({
          position: userPos,
          map: map,
          title: "You are here!",
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: getMarkerScale(map.getZoom()),
            fillColor: "#D9A70F",
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: "#000000",
          },
        });

        map.addListener("zoom_changed", () => {
          const zoom = map.getZoom();
          const icon = marker.getIcon();
          icon.scale = getMarkerScale(zoom);
          marker.setIcon(icon);
        });

        // Optional: draw a circle around current location
        const circle = new google.maps.Circle({
          center: userPos,
          radius: 100, // meters
          map: map,
          fillColor: "#DE1BB4",
          fillOpacity: 0.1,
          strokeColor: "#DE1B1E",
          strokeOpacity: 0.8,
          strokeWeight: 2,
        });

      },
      () => console.log("Geolocation failed, using default center")
    );
  }

  const locationButton = document.createElement("div");
    locationButton.innerHTML = "📍";
    locationButton.classList.add("locate-button");
    map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(locationButton);

    locationButton.addEventListener("click", () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const pos = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };
            map.setCenter(pos);
            map.setZoom(16);
          },
          () => {
            alert("Unable to fetch location.");
          }
        );
      } else {
        alert("Geolocation not supported.");
      }
    });
}


function getMarkerScale(zoom) {
  // Adjust this logic to your preference
  return Math.max(4, zoom); // e.g., scale increases with zoom
}

function setupListeners() {
  const debouncedLoadMarkers = debounce(loadMarkers, 500);

  map.addListener("bounds_changed", ()=>{
    debouncedLoadMarkers();
  });

  let longPressTimeout;

  map.addListener("mousedown", (event) => {
    longPressTimeout = setTimeout(() => {
        roomConfig.predefinedFields.forEach((field) => addField(field, ""));
        selectedPosition = event.latLng;
        document.getElementById("marker-form").classList.remove("hidden");
    }, 800);
  });

  map.addListener("mouseup", () => clearTimeout(longPressTimeout));
  map.addListener("drag", () => {
    clearTimeout(longPressTimeout);
    if(highlightCircle){
      highlightCircle.setMap(null);
      highlightCircle = null;
    }
  });

  const input = document.getElementById("pac-input");
  const clearBtn = document.getElementById("clear-btn");

  input.addEventListener("input", () => {
    clearBtn.style.display = input.value ? "block" : "none";
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    clearBtn.style.display = "none";
    input.focus();
  });


  document.getElementById("add-field").addEventListener("click", () => addField());
  document.getElementById("save-marker").addEventListener("click", saveMarker);
  document.getElementById("cancel-marker").addEventListener("click", cancelMarker);
}

function debounce(func, delay) {
  return () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(func, delay);
  };
}

// ===================== MARKER MANAGEMENT ===================== //
async function loadMarkers() {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const bounds = map.getBounds();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    const response = await fetch(
      `${baseUri}/markers/${roomConfig.id}/bbox?min_lat=${sw.lat()}&min_lng=${sw.lng()}&max_lat=${ne.lat()}&max_lng=${ne.lng()}`
    );
    const fetchedMarkersData = await response.json();

    const newMarkersFetched = fetchedMarkersData.filter(marker => !(marker.id in markers));
    newMarkersFetched.forEach(addMarkerToMap);
  } catch (error) {
    console.error("Error loading markers:", error);
  }
}

function addMarkerToMap(markerData) {
  const position = {
    lat: parseFloat(markerData.lat),
    lng: parseFloat(markerData.lng),
  };

  const marker = new google.maps.Marker({
    position,
    map,
    title: markerData.data?.description || "Marker",
    
  });

  const circle = new google.maps.Circle({
    center: position,
    radius: 100, // meters
    map: map,
    fillColor: "#DE1BB4",
    fillOpacity: 0.05,
    strokeColor: "green",
    strokeOpacity: 0.8,
    strokeWeight: 2,
  });

  markers[markerData.id] = marker;
  circles[markerData.id] = circle;
  marker.addListener("click", () => showMarkerPopup(marker, markerData));
}

function showMarkerPopup(marker, markerData) {
  const detailsContainer = document.getElementById("popup-details");
  detailsContainer.innerHTML = "";

  if (markerData.data) {
    Object.entries(markerData.data).forEach(([key, value]) => {
      const detail = document.createElement("p");
      detail.innerHTML = `<strong>${key}:</strong> ${value}`;
      detailsContainer.appendChild(detail);
    });
  }

  document.getElementById("marker-popup").classList.remove("hidden");

  document.getElementById("popup-edit").onclick = () => {
    document.getElementById("dynamic-fields-container").innerHTML = "";

    if (markerData.data) {
      Object.entries(markerData.data).forEach(([key, value]) => addField(key, value));
    } else {
      addField();
    }

    document.getElementById("form-title").textContent = "Edit Marker";
    document.getElementById("marker-form").classList.remove("hidden");
    document.getElementById("marker-popup").classList.add("hidden");
    selectedPosition = marker.getPosition();
    editingMarkerId = markerData.id;
  };

  document.getElementById("popup-delete").onclick = async () => {
    if (confirm("Delete this marker?")) {
      await deleteMarker(markerData.id);
      document.getElementById("marker-popup").classList.add("hidden");
    }
  };

  document.getElementById("popup-open").onclick = () => {
    const position = marker.getPosition();
    const url = `https://www.google.com/maps?q=${position.lat()},${position.lng()}`;
    window.open(url, "_blank");
  };

  document.getElementById("popup-close").onclick = () => {
    document.getElementById("marker-popup").classList.add("hidden");
  };
}

async function saveMarker() {
  const fieldRows = document.querySelectorAll(".field-row");
  const data = {};

  fieldRows.forEach((row) => {
    const key = row.querySelector(".field-key").value.trim();
    const value = row.querySelector(".field-value").value.trim();
    if (key) data[key] = value;
  });

  if (roomConfig.mandatoryFields.some((f) => !data[f]?.trim())) {
    alert("Please fill all mandatory fields.");
    return;
  }

  if (Object.keys(data).length === 0) {
    alert("Please add at least one field");
    return;
  }

  try {
    const url = editingMarkerId
      ? `${baseUri}/markers/${editingMarkerId}`
      : `${baseUri}/markers/`;

    const method = editingMarkerId ? "PUT" : "POST";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: selectedPosition.lat(),
        lng: selectedPosition.lng(),
        data,
        room_id: roomConfig.id,
      }),
    });

    const newMarker = await response.json();
    addMarkerToMap(newMarker);
    cancelMarker();
  } catch (error) {
    console.error("Error saving marker:", error);
  }
}

async function deleteMarker(markerId) {
  try {
    await fetch(`${baseUri}/markers/${markerId}`, { method: "DELETE" });
    if (markers[markerId]) {
      markers[markerId].setMap(null);
      delete markers[markerId];
    }

    if (circles[markerId]) {
      circles[markerId].setMap(null); // ✅ remove circle
      delete circles[markerId];
    }
  } catch (error) {
    console.error("Error deleting marker:", error);
  }
}

function cancelMarker() {
  document.getElementById("marker-form").classList.add("hidden");
  document.getElementById("dynamic-fields-container").innerHTML = "";
  document.getElementById("form-title").textContent = "Add Marker";
  selectedPosition = null;
  editingMarkerId = null;
}

function addField(key = "", value = "") {
    const container = document.getElementById("dynamic-fields-container");
    const row = document.createElement("div");
    row.className = "field-row";
  
    const isPredefined = roomConfig?.predefinedFields?.includes(key);
    const isMandatory = roomConfig?.mandatoryFields?.includes(key);
  
    row.innerHTML = `
      <input 
        type="text" 
        placeholder="Field name" 
        value="${key}" 
        class="field-key" 
        ${isPredefined ? 'readonly' : ''} 
      />
      <div class="value-wrapper" style="display: flex; align-items: center; gap: 4px;">
        <input 
          type="text" 
          placeholder="Field value" 
          value="${value}" 
          class="field-value" 
          ${isMandatory ? 'required' : ''} 
        />
        ${isMandatory ? '<span style="color: red;">*</span>' : ''}
      </div>
      ${!isPredefined ? '<button class="remove-field">×</button>' : ''}
    `;
  
    if (!isPredefined) {
      row.querySelector(".remove-field").onclick = () => row.remove();
    }
  
    container.appendChild(row);
  }
  
  
async function loadRoomConfig(room_id) {
  try {

    const response = await fetch(`${baseUri}/rooms/${room_id}`);
    roomConfig = await response.json();
    
    if (typeof roomConfig.defaultLocation === "string") {
      const [lat, lng] = roomConfig.defaultLocation.split(",").map(Number);
      roomConfig.defaultLocation = { lat, lng };
    }

    if (!roomConfig.zoom) {
      roomConfig.zoom = 2;
    }
  } catch (error) {
    console.error("Error loading room config:", error);
  }
}

// ===================== ENTRY ===================== //
window.initMap = initMap;
