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
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  });
}
