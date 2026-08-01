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
  let reloadWhenVisible = false;

  const reloadForUpdate = () => {
    if (!shouldReloadForUpdate || reloading) return;
    if (document.visibilityState === "hidden") {
      reloadWhenVisible = true;
      return;
    }
    reloading = true;
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    reloadForUpdate();
  });

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "RAVAN_SW_ACTIVATED") reloadForUpdate();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && reloadWhenVisible) reloadForUpdate();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
      .then((registration) => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        const checkForUpdate = () => registration.update().catch(() => undefined);
        void checkForUpdate();

        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") void checkForUpdate();
        });
      })
      .catch(() => {
        // The app remains usable online if service-worker setup is unavailable.
      });
  });
}
