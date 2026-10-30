import type { WorkerBusyParams } from "./messages/WorkerBusyMessage";
import type { SetAsidePoints } from "./SetAsidePoints";
import type { PreviewPoint, WorkerHang } from "./WorkerDisplayWorkspace";

export function respondToWorkerHang(
  busy: WorkerBusyParams,
  target: {
    setAside: SetAsidePoints;
    selected: PreviewPoint | undefined;
    listeners: Iterable<(hang: WorkerHang) => void>;
  },
): WorkerHang {
  const { setAside, selected } = target;
  if (busy.routingTo) {
    if (setAside.any) {
      setAside.withholdAll();
    }
    setAside.add(busy.routingTo);
    if (selected) {
      setAside.add(selected);
    }
  }
  if (busy.location) {
    setAside.add({
      file: busy.location.uri,
      line: busy.location.range.start.line,
    });
  }
  const hang: WorkerHang = {
    busyMs: busy.busyMs,
    location: busy.location,
    previewWithheld: setAside.all,
  };
  for (const listener of [...target.listeners]) {
    try {
      listener(hang);
    } catch (e) {
      console.error(e);
    }
  }
  return hang;
}
