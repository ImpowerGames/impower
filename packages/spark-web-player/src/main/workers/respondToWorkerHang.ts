import type { WorkerBusyParams } from "./messages/WorkerBusyMessage";
import type { SetAsidePoints } from "./SetAsidePoints";
import type { PreviewPoint, WorkerHang } from "./WorkerDisplayWorkspace";

/**
 * What the player's workspace does first when its worker has run a story
 * without yielding for longer than the page waits (#679), before it restarts
 * the worker: it decides what the restarted worker must not route to, and
 * tells whoever listens, while every request still waiting on the old worker
 * is unanswered.
 *
 * When the stuck story was a route's or a display's (`routingTo`), the point
 * it was headed for is set aside, and so is the author's selection: the
 * restarted worker routes to the selection first, and the route that did not
 * yield can have been headed elsewhere (a compile routes to where the author
 * was when it began, and an editor sends selections the author did not
 * make), while one to the selection can run into the same loop. If a point
 * was already set aside in this revision, every point is withheld until the
 * project changes: the worker has now stopped answering twice without the
 * script changing, whether a route ran into the loop both times or PLAY ran
 * into it first, and a third route would most likely run into it again.
 * The line the story was running is set aside in any case.
 */
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
