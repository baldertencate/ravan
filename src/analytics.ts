type EventProperties = Record<string, string | number | boolean>;

type Umami = {
  track: (eventName: string, properties?: EventProperties) => void;
};

declare global {
  interface Window {
    umami?: Umami;
  }
}

const pendingEvents: Array<[string, EventProperties?]> = [];

function flushPendingEvents() {
  if (!window.umami) return;
  pendingEvents.splice(0).forEach(([eventName, properties]) => {
    window.umami?.track(eventName, properties);
  });
}

export function initAnalytics() {
  if (window.umami) {
    flushPendingEvents();
    return;
  }
  document
    .querySelector<HTMLScriptElement>('script[data-website-id="8eb24bb9-2d26-403c-9f7f-bc7b4d759f32"]')
    ?.addEventListener("load", flushPendingEvents, { once: true });
}

export function trackEvent(eventName: string, properties?: EventProperties) {
  if (window.umami) {
    window.umami.track(eventName, properties);
    return;
  }
  if (pendingEvents.length < 100) pendingEvents.push([eventName, properties]);
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
