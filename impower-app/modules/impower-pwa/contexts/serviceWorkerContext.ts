import React from "react";

export interface ServiceWorkerContextState {
  waitingWorker: ServiceWorker | null;
  isInstalled: boolean;
  canInstall: boolean;
  canUpdate: boolean;
  isOnline: boolean;
  onInstall: () => void;
  onUpdate: () => void;
}

export const ServiceWorkerContext =
  React.createContext<ServiceWorkerContextState>(undefined);
