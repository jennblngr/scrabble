import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { registerSW } from "virtual:pwa-register";

// autoUpdate: the page reloads as soon as a freshly deployed service worker
// takes over, instead of keeping the precached (old) bundle until the next
// launch. An installed PWA can stay alive in the background for days, so also
// look for a new version every time it comes back to the foreground.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") registration.update();
    });
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
