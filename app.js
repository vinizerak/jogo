(function () {
  var map = null;
  var userMarker = null;
  var userPos = null;
  var CONQUER_RADIUS = 500;

  var colors = { mine: '#5DCAA5', rival: '#F0997B', rival2: '#7F77DD', disputed: '#EF9F27' };
  var strokeColors = { mine: '#0F6E56', rival: '#993C1D', rival2: '#3C3489', disputed: '#854F0B' };

  // Territórios de exemplo. No app real, isso vem do servidor
  // (Firebase/Supabase) uma única vez quando o mapa carrega, e fica
  // em cache local até o usuário reabrir o app ou puxar para atualizar.
  var territories = [];

  function blobPolygon(centerLat, centerLng, radiusMeters, seed) {
    var points = [];
    var earthRadius = 6371000;
    var segments = 28;
    for (var i = 0; i <= segments; i++) {
      var angle = (Math.PI * 2 * i) / segments;
      var noise = Math.sin(angle * 3 + seed) * 0.12 + Math.sin(angle * 7 + seed * 2) * 0.06;
      var r = radiusMeters * (1 + noise);
      var dx = r * Math.cos(angle);
      var dy = r * Math.sin(angle);
      var dLat = (dy / earthRadius) * (180 / Math.PI);
      var dLng = (dx / (earthRadius * Math.cos(Math.PI * centerLat / 180))) * (180 / Math.PI);
      points.push([centerLat + dLat, centerLng + dLng]);
    }
    return points;
  }

  function toTurfPolygon(latlngRing) {
    var coords = latlngRing.map(function (p) { return [p[1], p[0]]; });
    coords.push(coords[0]);
    return turf.polygon([coords]);
  }

  function turfToLatLngs(turfPoly) {
    var coords = turfPoly.geometry.coordinates[0];
    return coords.map(function (c) { return [c[1], c[0]]; });
  }

  function drawTerritory(id, ring, owner, hatched) {
    var style = {
      color: strokeColors[owner],
      weight: 1.5,
      fillColor: colors[owner],
      fillOpacity: hatched ? 0.35 : 0.5,
      dashArray: hatched ? '6,5' : null
    };
    return L.polygon(ring, style).addTo(map);
  }

  function seedTerritoriesAround(lat, lng) {
    territories = [
      { id: 't1', lat: lat + 0.006, lng: lng - 0.004, radius: 500, owner: 'rival', seed: 1.2 },
      { id: 't2', lat: lat - 0.003, lng: lng + 0.006, radius: 500, owner: 'rival2', seed: 3.4 },
      { id: 't3', lat: lat + 0.009, lng: lng + 0.008, radius: 500, owner: 'rival', seed: 5.1 }
    ];
    territories.forEach(function (t) {
      var ring = blobPolygon(t.lat, t.lng, t.radius, t.seed);
      t.turfShape = toTurfPolygon(ring);
      t.currentLayer = drawTerritory(t.id, ring, t.owner, false);
    });
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
    }, 3200);
  }

  async function handleConquer() {
    if (!userPos) {
      showToast('ti-alert-triangle', '#993C1D', 'Localização indisponível', 'Aguarde o GPS carregar e tente de novo.');
      return;
    }

    var myRing = blobPolygon(userPos.lat, userPos.lng, CONQUER_RADIUS, Math.random() * 10);
    var myShape = toTurfPolygon(myRing);

    // Checagem 100% local, sem nenhuma chamada de servidor.
    var hasSomethingToConquer = false;
    territories.forEach(function (t) {
      var intersection = null;
      try {
        intersection = turf.intersect(turf.featureCollection([t.turfShape, myShape]));
      } catch (e) {
        intersection = null;
      }
      if (intersection && t.owner !== 'mine') hasSomethingToConquer = true;
    });

    if (!hasSomethingToConquer) {
      showToast('ti-info-circle', '#8a8880', 'Nada pra conquistar aqui', 'Essa área já é livre ou sua.');
      return;
    }

    // Só a partir daqui haveria chamada real ao servidor no app final:
    // 1) tirar foto (câmera nativa)
    // 2) enviar {lat, lng, timestamp, foto} para validação no backend
    // 3) backend faz o mesmo cálculo de interseção e persiste o resultado
    try {
      await window.NativeBridge.takePhoto();
    } catch (e) {
      // Usuário cancelou a foto — aborta a conquista.
      return;
    }

    territories.forEach(function (t) {
      var intersection = null;
      try {
        intersection = turf.intersect(turf.featureCollection([t.turfShape, myShape]));
      } catch (e) {
        intersection = null;
      }
      if (!intersection) return;

      map.removeLayer(t.currentLayer);

      var remaining = null;
      try {
        remaining = turf.difference(turf.featureCollection([t.turfShape, myShape]));
      } catch (e) {
        remaining = null;
      }

      if (remaining) {
        var remainRing = turfToLatLngs(remaining);
        t.currentLayer = drawTerritory(t.id + '-remain', remainRing, t.owner, false);
        t.turfShape = remaining;
      }

      var dispRing = turfToLatLngs(intersection);
      var dispLayer = drawTerritory(t.id + '-disputed', dispRing, 'disputed', true);
      dispLayer.bringToFront();
    });

    drawTerritory('me-' + Date.now(), myRing, 'mine', false);
    showToast('ti-swords', '#854F0B', 'Área em disputa', 'O pedaço mordido fica disputado por 24h.');
  }

  async function init() {
    var loadingScreen = document.getElementById('loadingScreen');

    var pos;
    try {
      pos = await window.NativeBridge.getCurrentPosition();
    } catch (e) {
      // Sem permissão de GPS: usa um ponto padrão para não travar o app.
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

    seedTerritoriesAround(pos.lat, pos.lng);

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
  }

  document.addEventListener('DOMContentLoaded', init);
})();
