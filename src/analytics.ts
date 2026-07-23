type EventProperties = Record<string, string | number | boolean>;

type Plausible = {
  (eventName: string, options?: { props?: EventProperties }): void;
  q?: unknown[][];
};

declare global {
  interface Window {
    plausible?: Plausible;
  }
}

const scriptSource = import.meta.env.VITE_PLAUSIBLE_SCRIPT_SRC?.trim();

export function initAnalytics() {
  if (!scriptSource || window.plausible) return;

  const plausible: Plausible = (eventName, options) => {
    plausible.q = plausible.q || [];
    plausible.q.push([eventName, options]);
  };
  window.plausible = plausible;

  const script = document.createElement("script");
  script.defer = true;
  script.src = scriptSource;
  document.head.appendChild(script);
}

export function trackEvent(eventName: string, properties?: EventProperties) {
  window.plausible?.(eventName, properties ? { props: properties } : undefined);
}

export function trackSessionEvent(
  storageKey: string,
  eventName: string,
  properties?: EventProperties,
) {
  if (sessionStorage.getItem(storageKey)) return;
  sessionStorage.setItem(storageKey, "true");
  trackEvent(eventName, properties);
}
