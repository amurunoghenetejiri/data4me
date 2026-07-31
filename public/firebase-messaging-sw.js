/* global importScripts, firebase, self */
importScripts("https://www.gstatic.com/firebasejs/12.17.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.17.0/firebase-messaging-compat.js");

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
  });
});
