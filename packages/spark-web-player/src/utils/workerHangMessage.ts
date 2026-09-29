import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";

/** What the author is told when the player restarts its worker because the
 *  script it ran did not yield (#679): what happened, the line it was
 *  running, and what becomes of PLAY or the preview. The preview withholds
 *  the line the author was on, and every line once a route or display has
 *  stopped the worker after something was already set aside since the
 *  script last changed (`respondToWorkerHang`). */
export function workerHangMessage(
  hang: {
    busyMs: number;
    location: DocumentLocation | null;
    previewWithheld?: boolean;
  },
  during: "play" | "preview",
): string {
  const seconds = Math.max(1, Math.round(hang.busyMs / 1000));
  const where = hang.location
    ? ` at line ${hang.location.range.start.line + 1} of ${fileName(hang.location.uri)}`
    : "";
  const what =
    `The script ran for ${seconds} ${seconds === 1 ? "second" : "seconds"}` +
    `${where} without stopping, possibly in an infinite loop, so the game ` +
    `preview was restarted.`;
  if (during === "play") {
    return hang.previewWithheld
      ? `${what} PLAY has stopped, and the preview is paused until the script changes.`
      : `${what} PLAY has stopped.`;
  }
  return hang.previewWithheld
    ? `${what} The preview is paused until the script changes.`
    : `${what} The preview will not show the line you were on until the script changes.`;
}

function fileName(uri: string) {
  const name = uri.split("/").at(-1) || uri;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}
