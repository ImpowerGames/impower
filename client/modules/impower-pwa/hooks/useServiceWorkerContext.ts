import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Workbox } from "workbox-window";
import { useRouter } from "../../impower-router";
import { ServiceWorkerContextState } from "../contexts/serviceWorkerContext";
import {
  BeforeInstallPromptEvent,
  isBeforeInstallPromptEvent,
} from "../types/beforeInstallPromptEvent";
import { isWorkerWindow } from "../types/workerWindow";
import { isAppInstalled } from "../utils/isAppInstalled";

let deferredPrompt: BeforeInstallPromptEvent;

export const useServiceWorkerContextState = (props: {
  swPath?: string;
  scope?: string;
  startUrl?: string;
  onInstallReady?: () => void;
  onUpdateReady?: () => void;
}): ServiceWorkerContextState => {
  const { swPath, scope, startUrl, onInstallReady, onUpdateReady } = props;

  const [waitingWorker, setWaitingWorker] =
    React.useState<ServiceWorker | null>(null);
  const [canInstall, setCanInstall] = React.useState(false);
  const [canUpdate, setCanUpdate] = React.useState(false);
  const [isInstalled, setIsInstalled] = useState<boolean>();
  const [isOnline, setIsOnline] = useState(true);

  const router = useRouter();

  const onAppInstalled = useCallback(async () => {
    const logInfo = (await import("../../impower-logger/utils/logInfo"))
      .default;
    logInfo("PWA", "App was installed"); // eslint-disable-line no-console
    setIsInstalled(true);
    router.replace(scope);
  }, [setIsInstalled, router, scope]);

  const onInstall = useCallback(() => {
    if (deferredPrompt) {
      // Show the default install dialog
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === "accepted") {
          onAppInstalled();
        }
      });
    }
  }, [onAppInstalled]);

  const onUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({
        type: "SKIP_WAITING",
      });
    }
    window.location.reload();
  }, [waitingWorker]);

  useEffect(() => {
    if ("serviceWorker" in navigator && isWorkerWindow(window)) {
      const wb = new Workbox(swPath, { scope });
      window.workbox = wb;

      const onUpdate = (): void => {
        if (wb.getSW) {
          wb.getSW().then((sw: ServiceWorker) => setWaitingWorker(sw));
          setCanUpdate(true);
          if (onUpdateReady) {
            onUpdateReady();
          }
        }
      };

      // add event listeners to handle any of PWA lifecycle event
      // https://developers.google.com/web/tools/workbox/reference-docs/latest/module-workbox-window.Workbox#events
      wb.addEventListener("installed", async (event) => {
        if (isAppInstalled()) {
          onAppInstalled();
        }
        const logInfo = (await import("../../impower-logger/utils/logInfo"))
          .default;
        logInfo("PWA", `PWA: ${event.type}`); // eslint-disable-line no-console
      });

      wb.addEventListener("controlling", async (event) => {
        const logInfo = (await import("../../impower-logger/utils/logInfo"))
          .default;
        logInfo("PWA", `PWA: ${event.type}`); // eslint-disable-line no-console
      });

      wb.addEventListener("activated", async (event) => {
        const logInfo = (await import("../../impower-logger/utils/logInfo"))
          .default;
        logInfo("PWA", `PWA: ${event.type}`); // eslint-disable-line no-console
        if (!event.isUpdate) {
          const c = await caches.keys();
          if (!c.includes("start-url")) {
            fetch(startUrl);
          }
        }
      });

      // A common UX pattern for progressive web apps is to show a banner when a service worker has updated and waiting to install.
      // NOTE: MUST set skipWaiting to false in next.config.js pwa object
      // https://developers.google.com/web/tools/workbox/guides/advanced-recipes#offer_a_page_reload_for_users
      wb.addEventListener("waiting", async (event) => {
        onUpdate();
        const logInfo = (await import("../../impower-logger/utils/logInfo"))
          .default;
        logInfo("PWA", `PWA: ${event.type}`); // eslint-disable-line no-console
      });

      // never forget to call register as auto register is turned off in next.config.js
      wb.register();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setIsInstalled(isAppInstalled());
    if (deferredPrompt) {
      setCanInstall(true);
      if (onInstallReady) {
        onInstallReady();
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event): void => {
      if (isBeforeInstallPromptEvent(event)) {
        // Prevent the mini-infobar from appearing on mobile
        event.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = event;
        setCanInstall(true);
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return (): void => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  });

  useEffect(() => {
    if ("ononline" in window && "onoffline" in window) {
      setIsOnline(window.navigator.onLine);
      if (!window.ononline) {
        window.addEventListener("online", () => {
          setIsOnline(true);
        });
      }
      if (!window.onoffline) {
        window.addEventListener("offline", () => {
          setIsOnline(false);
        });
      }
    }
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && isWorkerWindow(window) && isOnline) {
      const wb = window.workbox;
      wb.active.then(() => {
        wb.messageSW({ action: "CACHE_NEW_ROUTE" });
      });
    }
  }, [isOnline, router.route]);

  const serviceWorkerContext = useMemo(
    () => ({
      waitingWorker,
      isInstalled,
      canInstall,
      canUpdate,
      isOnline,
      onInstall,
      onUpdate,
    }),
    [
      waitingWorker,
      isInstalled,
      canInstall,
      canUpdate,
      isOnline,
      onInstall,
      onUpdate,
    ]
  );

  return serviceWorkerContext;
};
