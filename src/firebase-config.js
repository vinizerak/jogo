// PREENCHA com as chaves do seu próprio projeto Firebase.
// Console: https://console.firebase.google.com
// Configurações do projeto > Seus apps > Configuração do SDK
var firebaseConfig = {
  apiKey: "COLOQUE_AQUI",
  authDomain: "COLOQUE_AQUI.firebaseapp.com",
  projectId: "COLOQUE_AQUI",
  storageBucket: "COLOQUE_AQUI.appspot.com",
  messagingSenderId: "COLOQUE_AQUI",
  appId: "COLOQUE_AQUI"
};

firebase.initializeApp(firebaseConfig);

var auth = firebase.auth();
var db = firebase.firestore();
var functions = firebase.functions();

window.Backend = {

  currentUserId: null,

  async ensureSignedIn() {
    return new Promise((resolve, reject) => {
      auth.onAuthStateChanged(async function (user) {
        if (user) {
          window.Backend.currentUserId = user.uid;
          resolve(user.uid);
          return;
        }
        try {
          var result = await auth.signInAnonymously();
          window.Backend.currentUserId = result.user.uid;
          resolve(result.user.uid);
        } catch (e) {
          reject(e);
        }
      });
    });
  },

  // Busca os territórios uma única vez (não fica escutando mudanças
  // em tempo real, para manter o custo de leitura baixo). O app
  // decide quando re-buscar: ao abrir, ou com pull-to-refresh.
  async fetchTerritories() {
    var snap = await db.collection('territories').get();
    var territories = [];
    snap.forEach(function (doc) {
      var data = doc.data();
      territories.push({
        id: doc.id,
        ownerId: data.ownerId,
        status: data.status,
        disputedBy: data.disputedBy || null,
        polygon: data.polygon
      });
    });
    return territories;
  },

  // Só é chamada quando o clique em "conquistar" já passou pela
  // checagem local mostrando que há algo a conquistar ali.
  async conquerTerritory(lat, lng) {
    var call = functions.httpsCallable('conquerTerritory');
    var result = await call({ lat: lat, lng: lng });
    return result.data;
  },

  async reinforceDispute(territoryId) {
    var call = functions.httpsCallable('reinforceDispute');
    var result = await call({ territoryId: territoryId });
    return result.data;
  }

};
