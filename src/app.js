(function () {
  var map = null;
  var userMarker = null;
  var userPos = null;
  var CONQUER_RADIUS = 500;

  var colors = { mine: '#5DCAA5', other: '#F0997B', disputed: '#EF9F27' };
  var strokeColors = { mine: '#0F6E56', other: '#993C1D', disputed: '#854F0B' };

  var territories = []; // cache local, carregado uma vez do Firestore
  var myPlayerId = null;

  function toTurfPolygon(coords) {
    return turf.polygon(coords);
  }

  function polygonCoordsToLatLngs(polygonCoords) {
    var ring = polygonCoords[0];
    return ring.map(function (c) { return [c[1], c[0]]; });
  }

  function ownerClass(t) {
    if (t.ownerId === myPlayerId) return 'mine';
    return t.status === 'disputed' ? 'disputed' : 'other';
  }

  function drawTerritory(t) {
    var cls = ownerClass(t);
    var ring = polygonCoordsToLatLngs(t.polygon);
    var style = {
      color: strokeColors[cls],
      weight: 1.5,
      fillColor: colors[cls],
      fillOpacity: cls === 'disputed' ? 0.4 : 0.5,
      dashArray: cls === 'disputed' ? '6,5' : null
    };
    var layer = L.polygon(ring, style).addTo(map);
    if (cls === 'disputed') layer.bringToFront();
    t.layer = layer;
  }

  function renderAllTerritories() {
    territories.forEach(function (t) {
      if (t.layer) map.removeLayer(t.layer);
      drawTerritory(t);
    });
  }

  async function loadTerritories() {
    territories = await window.Backend.fetchTerritories();
    renderAllTerritories();
  }

  function showToast(icon, iconColor, title, sub) {
    var toast = document.getElementById('toast');
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastSub').textContent = sub;
    var iconEl = toast.querySelector('i');
    iconEl.className = 'ti ' + icon;
    iconEl.style.color = iconColor;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      toast.classList.remove('show');
    }, 6000);
  }

  function estimateMyCircle(lat, lng) {
    var points = [];
    var earthRadius = 6371000;
    var segments = 24;
    for (var i = 0; i <= segments; i++) {
      var angle = (Math.PI * 2 * i) / segments;
      var dx = CONQUER_RADIUS * Math.cos(angle);
      var dy = CONQUER_RADIUS * Math.sin(angle);
      var dLat = (dy / earthRadius) * (180 / Math.PI);
      var dLng = (dx / (earthRadius * Math.cos((Math.PI * lat) / 180))) * (180 / Math.PI);
      points.push([lng + dLng, lat + dLat]);
    }
    points.push(points[0]);
    return turf.polygon([points]);
  }

  async function handleConquer() {
    if (!userPos) {
      showToast('ti-alert-triangle', '#993C1D', 'Localização indisponível', 'Aguarde o GPS carregar e tente de novo.');
      return;
    }

    var myApproxShape = estimateMyCircle(userPos.lat, userPos.lng);

    var hasSomethingToConquer = false;
    territories.forEach(function (t) {
      if (t.ownerId === myPlayerId) return;
      var existingShape;
      try {
        existingShape = toTurfPolygon(t.polygon);
      } catch (e) {
        return;
      }
      var intersection = null;
      try {
        intersection = turf.intersect(turf.featureCollection([existingShape, myApproxShape]));
      } catch (e) {
        intersection = null;
      }
      if (intersection) hasSomethingToConquer = true;
    });

    var isAllFree = territories.every(function (t) {
      return t.ownerId !== myPlayerId;
    });

    if (!hasSomethingToConquer && territories.length > 0 && !isAllFree) {
      showToast('ti-info-circle', '#8a8880', 'Nada pra conquistar aqui', 'Essa área já é livre ou sua.');
      return;
    }

    try {
      await window.NativeBridge.takePhoto();
    } catch (e) {
      return;
    }

    showToast('ti-loader', '#6b6a66', 'Enviando conquista...', 'Validando sua localização no servidor.');

    try {
      var result = await window.Backend.conquerTerritory(userPos.lat, userPos.lng);
      await loadTerritories();
      if (result.conqueredSomething) {
        showToast('ti-swords', '#854F0B', 'Área em disputa', 'O pedaço mordido fica disputado por 24h.');
      } else {
        showToast('ti-check', '#0F6E56', 'Território conquistado', 'Área livre agora é sua.');
      }
    } catch (e) {
      console.error('Erro ao conquistar:', e);
      var errMsg = (e && e.message) ? e.message : 'Erro desconhecido';
      showToast('ti-alert-triangle', '#993C1D', 'Não deu pra conquistar', errMsg);
    }
  }

  async function init() {
    var loadingScreen = document.getElementById('loadingScreen');

    myPlayerId = await window.Backend.ensureSignedIn();

    var pos;
    var gpsError = null;
    try {
      pos = await window.NativeBridge.getCurrentPosition();
    } catch (e) {
      console.error('Erro de geolocalização:', e);
      gpsError = (e && e.message) ? e.message : 'Erro desconhecido';
      pos = { lat: -23.5558, lng: -46.6896 };
    }

    userPos = pos;
    loadingScreen.style.display = 'none';

    map = L.map('map', { zoomControl: false }).setView([pos.lat, pos.lng], 16);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    await loadTerritories();

    userMarker = L.circleMarker([pos.lat, pos.lng], {
      radius: 8,
      color: '#fff',
      weight: 2,
      fillColor: '#2f6fed',
      fillOpacity: 1
    }).addTo(map);

    document.getElementById('placeName').textContent = 'Você está aqui';

    document.getElementById('recenterBtn').addEventListener('click', function () {
      if (userPos) map.setView([userPos.lat, userPos.lng], 16);
    });

    document.getElementById('conquerBtn').addEventListener('click', handleConquer);

    if (gpsError) {
      setTimeout(function () {
        showToast('ti-alert-triangle', '#993C1D', 'GPS não encontrado', gpsError + ' — usando São Paulo como padrão.');
      }, 400);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
