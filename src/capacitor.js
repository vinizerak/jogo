// Ponte simples para os plugins nativos do Capacitor.
// Em ambiente web puro (fora do app empacotado), cai em um modo de
// simulação usando geolocalização do navegador, para permitir testar
// no navegador antes de gerar o APK.

window.NativeBridge = {

  async getCurrentPosition() {
    if (window.Capacitor && window.CapacitorPlugins && window.CapacitorPlugins.Geolocation) {
      const pos = await window.CapacitorPlugins.Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }

    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalização não disponível'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  },

  async takePhoto() {
    if (window.Capacitor && window.CapacitorPlugins && window.CapacitorPlugins.Camera) {
      const photo = await window.CapacitorPlugins.Camera.getPhoto({
        quality: 70,
        allowEditing: false,
        resultType: 'base64'
      });
      return photo.base64String;
    }

    // Fallback web: apenas confirma sem foto real (modo teste no navegador)
    return null;
  }

};
