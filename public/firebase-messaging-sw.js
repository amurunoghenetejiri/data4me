/* global importScripts, firebase, self */
importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDLdm7vutPj5OcYvFgt2LbHm1HJ0yFrYqw",
  authDomain: "data4me.firebaseapp.com",
  projectId: "data4me",
  storageBucket: "data4me.firebasestorage.app",
  messagingSenderId: "836568438253",
  appId: "1:836568438253:web:4e556deff7479203b503e4",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const title =
    (payload.notification && payload.notification.title) ||
    (payload.data && payload.data.title) ||
    "DATA4ME";

  const body =
    (payload.notification && payload.notification.body) ||
    (payload.data && payload.data.body) ||
    "";

  self.registration.showNotification(title, {
    body: body,
    icon: "/data4me-logo.png",
    badge: "/favicon.png",
    data: payload.data || {},
    tag: (payload.data && payload.data.notification_id) || undefined,
    image: (payload.notification && payload.notification.image) || undefined,
  });
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.action_url) || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ("focus" in list[i]) {
          list[i].focus();
          list[i].navigate(new URL(target, self.location.origin).href);
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
    })
  );
});
