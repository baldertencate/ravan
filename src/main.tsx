import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Landing from "./Landing";
import { initAnalytics } from "./analytics";
import "./styles.css";

initAnalytics();

const isApp = window.location.pathname.replace(/\/+$/, "").endsWith("/app");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isApp ? <App /> : <Landing />}
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  const shouldReloadForUpdate = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!shouldReloadForUpdate || reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {
        // The app remains usable online if service-worker setup is unavailable.
      });
  });
}
