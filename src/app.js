(function () {
  var map = null;
  var userMarker = null;
  var userPos = null;
  var CONQUER_RADIUS = 500;

  var colors = { mine: '#00E091', other: '#FF4D6A', disputed: '#FFC94A' };
  var strokeColors = { mine: '#7EFFCB', other: '#FF8FA3', disputed: '#FFE0A0' };

  var territories = []; // cache local, carregado uma vez do Firestore
  var myPlayerId = null;
  var myPlayerName = null;

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
      fillOpacity: cls === 'disputed' ? 0.55 : 0.7,
      dashArray: cls === 'disputed' ? '6,5' : null
    };
    var layer = L.polygon(ring, style).addTo(map);
    if (cls === 'disputed') layer.bringToFront();
    layer.on('click', function () { openTerritoryDetails(t); });
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

  function openTerritoryDetails(t) {
    var isMine = t.ownerId === myPlayerId;
    var areaKm2 = 0;
    try { areaKm2 = turf.area(toTurfPolygon(t.polygon)) / 1000000; } catch (e) {}

    var modal = document.getElementById('territoryModal');
    document.getElementById('territoryModalName').textContent = t.name || 'Território sem nome';
    var areaEl = document.getElementById('territoryModalArea');
    areaEl.textContent = areaKm2.toFixed(1) + ' km²';
    areaEl.style.color = isMine ? '#FFC94A' : '#F09595';

    var editBtn = document.getElementById('territoryModalEdit');
    var defendBtn = document.getElementById('territoryModalDefend');

    editBtn.style.display = isMine ? 'flex' : 'none';
    editBtn.onclick = function () {
      var novo = prompt('Novo nome para este território:', t.name || '');
      if (novo && novo.trim()) {
        renameTerritory(t.id, novo.trim());
      }
    };

    var isDisputedByMeAsOwner = t.status === 'disputed' && t.ownerId === myPlayerId;
    defendBtn.style.display = isDisputedByMeAsOwner ? 'flex' : 'none';
    defendBtn.onclick = function () { defendTerritory(t.id); };

    modal.classList.add('show');
  }

  function closeTerritoryModal() {
    document.getElementById('territoryModal').classList.remove('show');
  }

  async function renameTerritory(territoryId, newName) {
    try {
      await window.Backend.renameTerritory(territoryId, newName);
      await loadTerritories();
      closeTerritoryModal();
      showToast('ti-check', '#00E091', 'Nome atualizado', newName);
    } catch (e) {
      showToast('ti-alert-triangle', '#993C1D', 'Não deu pra renomear', (e && e.message) || 'Tente de novo.');
    }
  }

  async function defendTerritory(territoryId) {
    try {
      await window.Backend.reinforceDispute(territoryId);
      await loadTerritories();
      closeTerritoryModal();
      showToast('ti-shield', '#FFC94A', 'Defesa reforçada', 'O prazo de disputa foi reiniciado.');
    } catch (e) {
      showToast('ti-alert-triangle', '#993C1D', 'Não deu pra defender', (e && e.message) || 'Tente de novo.');
    }
  }

  function askTerritoryName(targetName) {
    return new Promise(function (resolve) {
      var modal = document.getElementById('nameModal');
      var input = document.getElementById('nameModalInput');
      var keepRow = document.getElementById('nameModalKeepRow');
      var keepBtn = document.getElementById('nameModalKeep');
      var confirmBtn = document.getElementById('nameModalConfirm');
      var cancelBtn = document.getElementById('nameModalCancel');
      var errorEl = document.getElementById('nameModalError');

      input.value = '';
      errorEl.style.display = 'none';
      keepRow.style.display = targetName ? 'flex' : 'none';

      modal.classList.add('show');
      setTimeout(function () { input.focus(); }, 100);

      function cleanup(result) {
        modal.classList.remove('show');
        keepBtn.onclick = null;
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        resolve(result);
      }

      if (targetName) {
        keepBtn.onclick = function () { cleanup({ keepExistingName: true, territoryName: null }); };
      }
      confirmBtn.onclick = function () {
        if (!input.value.trim()) {
          errorEl.style.display = 'block';
          return;
        }
        cleanup({ keepExistingName: false, territoryName: input.value.trim() });
      };
      cancelBtn.onclick = function () { cleanup(null); };
    });
  }

  async function handleConquer() {
    if (!userPos) {
      showToast('ti-alert-triangle', '#993C1D', 'Localização indisponível', 'Aguarde o GPS carregar e tente de novo.');
      return;
    }

    var myApproxShape = estimateMyCircle(userPos.lat, userPos.lng);

    var hasSomethingToConquer = false;
    var targetTerritory = null;
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
        intersection = turf.intersect(existingShape, myApproxShape);
      } catch (e) {
        intersection = null;
      }
      if (intersection) {
        hasSomethingToConquer = true;
        if (!targetTerritory) targetTerritory = t;
      }
    });

    var isAllFree = territories.every(function (t) {
      return t.ownerId !== myPlayerId;
    });

    if (!hasSomethingToConquer && territories.length > 0 && !isAllFree) {
      showToast('ti-info-circle', '#8a8880', 'Nada pra conquistar aqui', 'Essa área já é livre ou sua.');
      return;
    }

    var nameChoice = await askTerritoryName(targetTerritory ? targetTerritory.name : null);
    if (!nameChoice) return;

    try {
      await window.NativeBridge.takePhoto();
    } catch (e) {
      return;
    }

    showToast('ti-loader', '#6b6a66', 'Enviando conquista...', 'Validando sua localização no servidor.');

    try {
      var result = await window.Backend.conquerTerritory(
        userPos.lat, userPos.lng,
        nameChoice.territoryName,
        nameChoice.keepExistingName
      );
      await loadTerritories();
      if (result.conqueredSomething) {
        showToast('ti-swords', '#854F0B', 'Área em disputa', '"' + result.name + '" fica disputado por 24h.');
      } else {
        showToast('ti-check', '#0F6E56', 'Território conquistado', '"' + result.name + '" agora é seu.');
      }
    } catch (e) {
      console.error('Erro ao conquistar:', e);
      var errMsg = (e && e.message) ? e.message : 'Erro desconhecido';
      showToast('ti-alert-triangle', '#993C1D', 'Não deu pra conquistar', errMsg);
    }
  }

  function setupNavigation() {
    var navItems = document.querySelectorAll('.nav-item');
    var avatarBtn = document.getElementById('avatarBtn');

    function switchTo(screenId) {
      document.querySelectorAll('.screen').forEach(function (s) {
        s.classList.toggle('active', s.id === screenId);
      });
      navItems.forEach(function (n) {
        n.classList.toggle('active', n.dataset.screen === screenId);
      });
      if (screenId === 'screen-profile' || screenId === 'screen-ranking') {
        updateProfileAndRanking();
      }
      if (screenId === 'screen-history' || screenId === 'screen-alerts') {
        updateHistoryAndAlerts();
      }
    }

    navItems.forEach(function (n) {
      n.addEventListener('click', function () { switchTo(n.dataset.screen); });
    });

    if (avatarBtn) {
      avatarBtn.addEventListener('click', function () { switchTo('screen-profile'); });
    }
  }

  function updateProfileAndRanking() {
    var myTerritories = territories.filter(function (t) { return t.ownerId === myPlayerId; });
    var totalArea = 0;
    myTerritories.forEach(function (t) {
      try {
        var shape = toTurfPolygon(t.polygon);
        totalArea += turf.area(shape) / 1000000;
      } catch (e) {}
    });

    var nameEl = document.getElementById('profileName');
    var avatarEl = document.getElementById('profileAvatar');
    if (nameEl) nameEl.textContent = myPlayerName || 'Você';
    if (avatarEl) avatarEl.textContent = (myPlayerName || 'VC').slice(0, 2).toUpperCase();

    var areaEl = document.getElementById('profileArea');
    var countEl = document.getElementById('profileTerritories');
    if (areaEl) areaEl.textContent = totalArea.toFixed(1) + ' km²';
    if (countEl) countEl.textContent = myTerritories.length;

    var rankingList = document.getElementById('rankingList');
    if (rankingList) {
      if (territories.length === 0) {
        rankingList.innerHTML = '<p style="color:rgba(255,255,255,0.4); font-size:13px; text-align:center; padding:20px 0;">Ninguém conquistou nada ainda. Seja o primeiro.</p>';
      } else {
        var owners = {};
        territories.forEach(function (t) {
          if (!owners[t.ownerId]) owners[t.ownerId] = 0;
          try {
            owners[t.ownerId] += turf.area(toTurfPolygon(t.polygon)) / 1000000;
          } catch (e) {}
        });
        var sorted = Object.keys(owners).sort(function (a, b) { return owners[b] - owners[a]; });
        rankingList.innerHTML = sorted.map(function (ownerId, i) {
          var isMe = ownerId === myPlayerId;
          var name = isMe ? (myPlayerName || 'Você') : 'Jogador ' + ownerId.slice(0, 4);
          return '<div class="row"><span style="font-size:15px; font-weight:500; color:' + (isMe ? '#FFC94A' : 'rgba(255,255,255,0.4)') + '; width:20px;">' + (i + 1) + '</span>' +
            '<div class="avatar-circle" style="background:' + (isMe ? 'linear-gradient(145deg,#FFC94A,#D68F0C)' : 'rgba(255,255,255,0.1)') + '; color:' + (isMe ? '#3d2600' : 'rgba(255,255,255,0.6)') + ';">' + name.slice(0, 2).toUpperCase() + '</div>' +
            '<p style="margin:0; font-size:14px; color:' + (isMe ? '#fff' : 'rgba(255,255,255,0.7)') + '; flex:1;">' + name + '</p>' +
            '<p style="margin:0; font-size:14px; font-weight:500; color:' + (isMe ? '#FFC94A' : 'rgba(255,255,255,0.5)') + ';">' + owners[ownerId].toFixed(1) + ' km²</p></div>';
        }).join('');
      }
    }
  }

  var EVENT_ICONS = {
    conquered_free: { icon: 'ti-check', bg: 'linear-gradient(145deg,#7EFFCB,#00D98B)', color: '#003d26' },
    conquered_from_rival: { icon: 'ti-swords', bg: 'linear-gradient(145deg,#FFC94A,#D68F0C)', color: '#3d2600' },
    invaded: { icon: 'ti-swords', bg: 'linear-gradient(145deg,#E85D3C,#B8391F)', color: '#fff' },
    defended: { icon: 'ti-shield', bg: 'linear-gradient(145deg,#FFC94A,#D68F0C)', color: '#3d2600' },
    dispute_resolved: { icon: 'ti-flag-filled', bg: 'linear-gradient(145deg,#7EFFCB,#00D98B)', color: '#003d26' }
  };

  function timeAgo(ts) {
    var diff = Date.now() - ts;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return 'há ' + mins + ' min';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return 'há ' + hours + 'h';
    var days = Math.floor(hours / 24);
    return 'há ' + days + 'd';
  }

  function eventText(ev, isMe) {
    var who = isMe ? 'Você' : 'Alguém';
    switch (ev.type) {
      case 'conquered_free': return who + ' conquistou ' + ev.territoryName;
      case 'conquered_from_rival': return who + ' invadiu ' + ev.territoryName;
      case 'invaded': return (ev.playerId === myPlayerId ? 'Você invadiu' : 'Seu território foi invadido:') + ' ' + ev.territoryName;
      case 'defended': return who + ' defendeu ' + ev.territoryName;
      case 'dispute_resolved': return ev.territoryName + ' foi decidido';
      default: return ev.territoryName || 'Evento';
    }
  }

  async function updateHistoryAndAlerts() {
    var historyList = document.getElementById('historyList');
    var alertsList = document.getElementById('alertsList');

    var events = [];
    try {
      events = await window.Backend.getMyEvents();
    } catch (e) {
      console.error('Erro ao buscar eventos:', e);
    }

    if (historyList) {
      if (events.length === 0) {
        historyList.innerHTML = '<p style="color:rgba(255,255,255,0.4); font-size:13px; text-align:center; padding:20px 0;">Nenhum evento ainda. Conquiste seu primeiro território.</p>';
      } else {
        historyList.innerHTML = events.map(function (ev) {
          var meta = EVENT_ICONS[ev.type] || EVENT_ICONS.conquered_free;
          var isMe = ev.playerId === myPlayerId;
          return '<div class="row"><div class="icon-badge" style="background:' + meta.bg + ';"><i class="ti ' + meta.icon + '" style="font-size:16px; color:' + meta.color + ';" aria-hidden="true"></i></div>' +
            '<div style="flex:1;"><p style="margin:0; font-size:13px; color:#fff;">' + eventText(ev, isMe) + '</p>' +
            '<p style="margin:1px 0 0; font-size:11px; color:rgba(255,255,255,0.4);">' + timeAgo(ev.createdAt) + '</p></div></div>';
        }).join('');
      }
    }

    var myAlerts = territories.filter(function (t) {
      return t.status === 'disputed' && (t.ownerId === myPlayerId || t.disputedBy === myPlayerId) && t.disputeExpiresAt;
    });

    if (alertsList) {
      if (myAlerts.length === 0) {
        alertsList.innerHTML = '<p style="color:rgba(255,255,255,0.4); font-size:13px; text-align:center; padding:20px 0;">Nenhum alerta no momento.</p>';
      } else {
        alertsList.innerHTML = myAlerts.map(function (t) {
          var remainingMs = t.disputeExpiresAt - Date.now();
          var hours = Math.max(0, Math.floor(remainingMs / 3600000));
          var mins = Math.max(0, Math.floor((remainingMs % 3600000) / 60000));
          var isDefending = t.ownerId === myPlayerId;
          return '<div style="background:' + (isDefending ? 'rgba(232,93,60,0.12)' : 'rgba(255,201,74,0.08)') + '; border:1px solid ' + (isDefending ? 'rgba(232,93,60,0.3)' : 'rgba(255,201,74,0.2)') + '; border-radius:14px; padding:12px 14px; margin-bottom:10px; display:flex; align-items:center; gap:12px;">' +
            '<i class="ti ' + (isDefending ? 'ti-alert-triangle' : 'ti-clock') + '" style="font-size:20px; color:' + (isDefending ? '#E85D3C' : '#FFC94A') + ';" aria-hidden="true"></i>' +
            '<div><p style="margin:0; font-size:13px; font-weight:500; color:#fff;">' + t.name + (isDefending ? ' sob ataque' : '') + '</p>' +
            '<p style="margin:1px 0 0; font-size:12px; color:rgba(255,255,255,0.5);">' + (isDefending ? 'Defenda em ' : 'Decide em ') + hours + 'h ' + mins + 'min</p></div></div>';
        }).join('');
      }
    }
  }

  function setupTerritoryModals() {
    document.getElementById('territoryModalClose').addEventListener('click', closeTerritoryModal);
  }

  async function startApp() {
    var loadingScreen = document.getElementById('loadingScreen');
    loadingScreen.style.display = 'flex';
    loadingScreen.querySelector('p').textContent = 'Localizando o campo de batalha...';

    setupNavigation();
    setupTerritoryModals();

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

  function showLoginScreen() {
    var loginScreen = document.getElementById('loginScreen');
    var loadingScreen = document.getElementById('loadingScreen');
    loadingScreen.style.display = 'none';
    loginScreen.style.display = 'flex';

    document.getElementById('googleLoginBtn').addEventListener('click', async function () {
      var btn = this;
      btn.disabled = true;
      btn.querySelector('span').textContent = 'Entrando...';
      try {
        await window.Backend.signInWithGoogle();
        myPlayerId = window.Backend.currentUserId;
        myPlayerName = window.Backend.currentUserName;
        loginScreen.style.display = 'none';
        await startApp();
      } catch (e) {
        console.error('Erro no login:', e);
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Entrar com Google';
        showToast('ti-alert-triangle', '#993C1D', 'Não deu pra entrar', (e && e.message) || 'Tente de novo.');
      }
    });
  }

  async function init() {
    var existing = await window.Backend.getExistingSession();
    if (existing) {
      myPlayerId = window.Backend.currentUserId;
      myPlayerName = window.Backend.currentUserName;
      await startApp();
    } else {
      showLoginScreen();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
