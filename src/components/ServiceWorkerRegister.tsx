"use client";

import { useEffect } from "react";

/** Registers the hand-written service worker (public/sw.js) so the app
 * can be installed from the browser. No-op on browsers without SW support. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failing (e.g. non-HTTPS preview) must never break the app.
      });
    }
  }, []);
  return null;
}
