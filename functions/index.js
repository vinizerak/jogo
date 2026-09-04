const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const turf = require('@turf/turf');

initializeApp();
const db = getFirestore();

const CONQUER_RADIUS_METERS = 500;
const DISPUTE_WINDOW_HOURS = 24;

function blobPolygon(lat, lng, radiusMeters, seed) {
  const points = [];
  const earthRadius = 6371000;
  const segments = 28;
  for (let i = 0; i <= segments; i++) {
    const angle = (Math.PI * 2 * i) / segments;
    const noise = Math.sin(angle * 3 + seed) * 0.12 + Math.sin(angle * 7 + seed * 2) * 0.06;
    const r = radiusMeters * (1 + noise);
    const dx = r * Math.cos(angle);
    const dy = r * Math.sin(angle);
    const dLat = (dy / earthRadius) * (180 / Math.PI);
    const dLng = (dx / (earthRadius * Math.cos((Math.PI * lat) / 180))) * (180 / Math.PI);
    points.push([lng + dLng, lat + dLat]);
  }
  points.push(points[0]);
  return turf.polygon([points]);
}

// Chamada pelo app quando o jogador clica em "conquistar" e a foto é
// tirada. Recebe apenas lat/lng — a validação real de "essa área faz
// sentido conquistar" acontece aqui, no servidor, nunca confiando no
// que o app disse sozinho.
exports.conquerTerritory = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'É preciso estar autenticado.');
  }

  const playerId = request.auth.uid;
  const { lat, lng } = request.data;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new HttpsError('invalid-argument', 'Localização inválida.');
  }

  const myShape = blobPolygon(lat, lng, CONQUER_RADIUS_METERS, Math.random() * 10);
  const now = Date.now();

  const territoriesSnap = await db.collection('territories').get();
  const batch = db.batch();
  let conqueredSomething = false;

  for (const doc of territoriesSnap.docs) {
    const t = doc.data();
    if (t.ownerId === playerId) continue;

    let existingShape;
    try {
      existingShape = turf.polygon(JSON.parse(t.polygon));
    } catch (e) {
      continue;
    }

    let intersection;
    try {
      intersection = turf.intersect(turf.featureCollection([existingShape, myShape]));
    } catch (e) {
      continue;
    }
    if (!intersection) continue;

    conqueredSomething = true;

    let remaining;
    try {
      remaining = turf.difference(turf.featureCollection([existingShape, myShape]));
    } catch (e) {
      remaining = null;
    }

    if (remaining) {
      batch.update(doc.ref, { polygon: JSON.stringify(remaining.geometry.coordinates) });
    } else {
      batch.delete(doc.ref);
    }

    const disputeRef = db.collection('territories').doc();
    batch.set(disputeRef, {
      ownerId: t.ownerId,
      status: 'disputed',
      disputedBy: playerId,
      polygon: JSON.stringify(intersection.geometry.coordinates),
      disputeExpiresAt: now + DISPUTE_WINDOW_HOURS * 60 * 60 * 1000,
      lastCheckinAt: now
    });
  }

  if (!conqueredSomething) {
    // Área livre: cria território novo direto, sem disputa.
    const newRef = db.collection('territories').doc();
    batch.set(newRef, {
      ownerId: playerId,
      status: 'owned',
      polygon: JSON.stringify(myShape.geometry.coordinates),
      lastCheckinAt: now
    });
  } else {
    const newRef = db.collection('territories').doc();
    batch.set(newRef, {
      ownerId: playerId,
      status: 'owned',
      polygon: JSON.stringify(myShape.geometry.coordinates),
      lastCheckinAt: now
    });
  }

  await batch.commit();

  return { success: true, conqueredSomething };
});

// Chamada quando um jogador faz check-in numa área já disputada,
// reiniciando o prazo de 24h em vez de criar uma disputa nova.
exports.reinforceDispute = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'É preciso estar autenticado.');
  }

  const { territoryId } = request.data;
  const playerId = request.auth.uid;
  const now = Date.now();

  const ref = db.collection('territories').doc(territoryId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Território não encontrado.');
  }

  await ref.update({
    disputedBy: playerId,
    disputeExpiresAt: now + DISPUTE_WINDOW_HOURS * 60 * 60 * 1000,
    lastCheckinAt: now
  });

  return { success: true };
});

// Roda automaticamente a cada hora. Resolve disputas cujo prazo de
// 24h (contado a partir do último check-in) já passou: o território
// vira definitivamente do último jogador que fez check-in ali.
// Rodar por agendamento, em vez de o app ficar checando isso, é o
// que mantém o custo de servidor baixo.
exports.resolveExpiredDisputes = onSchedule('every 60 minutes', async () => {
  const now = Date.now();
  const expiredSnap = await db.collection('territories')
    .where('status', '==', 'disputed')
    .where('disputeExpiresAt', '<=', now)
    .get();

  const batch = db.batch();
  expiredSnap.forEach((doc) => {
    const t = doc.data();
    batch.update(doc.ref, {
      status: 'owned',
      ownerId: t.disputedBy,
      disputedBy: FieldValue.delete(),
      disputeExpiresAt: FieldValue.delete()
    });
  });
  await batch.commit();
});
