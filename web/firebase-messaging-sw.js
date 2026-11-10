/* FCM's service worker displays data-only messages when SyncedM is closed. */
importScripts("https://www.gstatic.com/firebasejs/13.1.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyC6fX9Y78xAbArNcw9_J5Nz8qb9cWJxLIE",
  authDomain: "synedn.web.app",
  projectId: "synedn",
  storageBucket: "synedn.firebasestorage.app",
  messagingSenderId: "811884997432",
  appId: "1:811884997432:web:8990a1ab309505785cafcd",
  measurementId: "G-MX0DEPG1PZ"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  return self.registration.showNotification(data.title || "SyncedM team update", {
    body: data.body || "There is a new update from your team.",
    icon: "/assets/syncedm-brand-mark-padded.png",
    badge: "/assets/syncedm-brand-mark-padded.png",
    tag: (data.type || "team") + "-" + (data.teamCode || ""),
    data: { url: data.url || "/" }
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clientsList) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        if ("navigate" in client && client.url !== target) await client.navigate(target);
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
