// PREENCHA com as chaves do seu próprio projeto Firebase.
// Console: https://console.firebase.google.com
// Configurações do projeto > Seus apps > Configuração do SDK
var firebaseConfig = {
  apiKey: "AIzaSyDMMQ6NpZfYp4r_SvYnRbst4ZmpmUcW2ws",
  authDomain: "territorio-app-a49f5.firebaseapp.com",
  projectId: "territorio-app-a49f5",
  storageBucket: "territorio-app-a49f5.firebasestorage.app",
  messagingSenderId: "389641175053",
  appId: "1:389641175053:web:04ef891f6ecdc620495544"
};

firebase.initializeApp(firebaseConfig);

var auth = firebase.auth();
var db = firebase.firestore();
var functions = firebase.functions();

window.Backend = {

  currentUserId: null,
  currentUserName: null,
  currentUserPhoto: null,

  // Tenta manter a sessão existente (Google, se já logado antes).
  // Se não houver ninguém logado, NÃO faz login anônimo automático:
  // quem decide fazer login com Google é o próprio jogador, na tela
  // inicial.
  async getExistingSession() {
    return new Promise((resolve) => {
      auth.onAuthStateChanged(function (user) {
        if (user) {
          window.Backend.currentUserId = user.uid;
          window.Backend.currentUserName = user.displayName || 'Jogador';
          window.Backend.currentUserPhoto = user.photoURL || null;
          resolve(user);
        } else {
          resolve(null);
        }
      });
    });
  },

  async signInWithGoogle() {
    var provider = new firebase.auth.GoogleAuthProvider();
    var result = await auth.signInWithPopup(provider);
    window.Backend.currentUserId = result.user.uid;
    window.Backend.currentUserName = result.user.displayName || 'Jogador';
    window.Backend.currentUserPhoto = result.user.photoURL || null;
    return result.user;
  },

  async signOut() {
    await auth.signOut();
    window.Backend.currentUserId = null;
    window.Backend.currentUserName = null;
    window.Backend.currentUserPhoto = null;
  },

  // Busca os territórios uma única vez (não fica escutando mudanças
  // em tempo real, para manter o custo de leitura baixo). O app
  // decide quando re-buscar: ao abrir, ou com pull-to-refresh.
  async fetchTerritories() {
    var snap = await db.collection('territories').get();
    var territories = [];
    snap.forEach(function (doc) {
      var data = doc.data();
      var polygon;
      try {
        polygon = typeof data.polygon === 'string' ? JSON.parse(data.polygon) : data.polygon;
      } catch (e) {
        polygon = null;
      }
      if (!polygon) return;
      territories.push({
        id: doc.id,
        ownerId: data.ownerId,
        status: data.status,
        disputedBy: data.disputedBy || null,
        name: data.name || 'Território sem nome',
        disputeExpiresAt: data.disputeExpiresAt || null,
        polygon: polygon
      });
    });
    return territories;
  },

  // Só é chamada quando o clique em "conquistar" já passou pela
  // checagem local mostrando que há algo a conquistar ali.
  // territoryName: obrigatório em conquista de área livre ou quando
  // o jogador escolhe renomear. keepExistingName: true quando o
  // jogador escolhe manter o nome do território que está roubando.
  async conquerTerritory(lat, lng, territoryName, keepExistingName) {
    var call = functions.httpsCallable('conquerTerritory');
    var result = await call({ lat: lat, lng: lng, territoryName: territoryName, keepExistingName: !!keepExistingName });
    return result.data;
  },

  async reinforceDispute(territoryId) {
    var call = functions.httpsCallable('reinforceDispute');
    var result = await call({ territoryId: territoryId });
    return result.data;
  },

  async renameTerritory(territoryId, newName) {
    var call = functions.httpsCallable('renameTerritory');
    var result = await call({ territoryId: territoryId, newName: newName });
    return result.data;
  },

  async getMyEvents() {
    var call = functions.httpsCallable('getMyEvents');
    var result = await call({});
    return result.data.events || [];
  }

};
