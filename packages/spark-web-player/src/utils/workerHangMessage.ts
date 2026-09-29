import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";

/** What the author is told when the player restarts its worker because the
 *  script it ran did not yield (#679): what happened, the line it was
 *  running, and what becomes of PLAY or the preview. */
export function workerHangMessage(
  hang: { busyMs: number; location: DocumentLocation | null },
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
  return during === "play"
    ? `${what} PLAY has stopped.`
    : `${what} The preview will show that line again once the script changes.`;
}

function fileName(uri: string) {
  const name = uri.split("/").at(-1) || uri;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}
