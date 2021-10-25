import { Workbox } from "workbox-window";

export interface WorkerWindow extends Window {
  workbox: Workbox;
}

export const isWorkerWindow = (obj: unknown): obj is WorkerWindow => {
  if (!obj) {
    return false;
  }
  const workerWindow = obj as WorkerWindow;
  return workerWindow.workbox !== undefined;
};
