// Kitverse admin push notifications
self.addEventListener("push", (event) => {
  const d = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(d.title || "Kitverse", {
    body: d.body || "", data: { link: d.link || "/admin" }, tag: d.link || undefined,
    requireInteraction: !!d.urgent, icon: "/icon-192.png", badge: "/icon-192.png", dir: "auto", lang: "ar",
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.link || "/admin";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if ("focus" in c) { c.navigate(url); return c.focus(); }
    return clients.openWindow(url);
  }));
});
