import { Port2MessageConnection } from "@impower/jsonrpc/src/browser/classes/Port2MessageConnection";
import { isMessage } from "@impower/jsonrpc/src/common/utils/isMessage";
import {
  MessageProtocol,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DraggedFilesInMessage } from "@impower/spark-editor-protocol/src/protocols/window/DraggedFilesInMessage";
import { DraggedFilesOutMessage } from "@impower/spark-editor-protocol/src/protocols/window/DraggedFilesOutMessage";
import { DraggedFilesOverMessage } from "@impower/spark-editor-protocol/src/protocols/window/DraggedFilesOverMessage";
import { DroppedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/window/DroppedFilesMessage";
import {
  SparkWebPlayerElement,
  setWorkspace,
} from "@impower/spark-web-player/src/index.js";
import { installWorkspaceWorker } from "@impower/spark-web-player/src/main/workers/installWorkspaceWorker";
import "./style.css";

const SPARKDOWN_EDITOR_ORIGIN = import.meta.env.VITE_SPARKDOWN_EDITOR_ORIGIN;

// Are we running on a local dev host? The editor's dev port varies per worktree,
// so the build-time `VITE_SPARKDOWN_EDITOR_ORIGIN` is fragile in dev: if it's
// unset or drifts from the editor's real port, EVERY handshake reply below posts
// to the wrong (or `undefined` → throwing) targetOrigin and the Game Preview
// silently stays BLACK — the editor never completes its connect/Initialize. On
// localhost there's no cross-site security boundary to protect, so we relax:
// accept the editor's connect from ANY origin and reply to the origin it
// actually contacted us from (`replyTargetOrigin`, captured below), defaulting
// to "*". Production (any non-localhost host) keeps the strict, build-time origin
// so a hostile cross-site framer can never drive the player.
const IS_LOCALHOST = ["localhost", "127.0.0.1", "[::1]"].includes(
  window.location.hostname,
);

// The targetOrigin our postMessage replies go to. In prod it's the pinned
// build-time origin. On localhost it starts permissive ("*") and is upgraded to
// the editor's REAL origin as soon as the editor's first message arrives — so
// even a missing/wrong VITE_SPARKDOWN_EDITOR_ORIGIN can't black-screen the
// preview. The capture listener is registered BEFORE `connection.listen()` so the
// value is resolved before the connection sends any reply.
let replyTargetOrigin: string | undefined = IS_LOCALHOST
  ? SPARKDOWN_EDITOR_ORIGIN || "*"
  : SPARKDOWN_EDITOR_ORIGIN;
if (IS_LOCALHOST) {
  window.addEventListener("message", (e) => {
    if (
      e.source === window.parent &&
      typeof e.origin === "string" &&
      e.origin &&
      e.origin !== "null"
    ) {
      replyTargetOrigin = e.origin;
    }
  });
}

// DEV-ONLY same-origin preview: when the editor proxies this app under its own
// origin (see impower-dev/build.ts + vite base "/__player/"), our origin equals
// the editor's. The postMessage handshake then matches exactly with no origin
// relaxation needed.
const SAME_ORIGIN = window.location.origin === SPARKDOWN_EDITOR_ORIGIN;

// Whether the editor is proxying us same-origin under "/__player/". Derived from
// the BUILD BASE (vite.config sets base "/__player/" iff same-origin preview is
// on), NOT the port-fragile baked VITE_SPARKDOWN_EDITOR_ORIGIN: that env can
// drift from the editor's real port (per-worktree dev ports), and when it does
// the origin compare above goes wrongly false. We use this robust signal ONLY to
// gate service-worker registration (below): registering our own /sw.js while the
// editor already controls this origin mints a SECOND, competing root-scoped SW
// at the editor's scope, whose install→claim fires `controllerchange` in the
// editor top frame → its reload handler → endless reload loop. The editor's
// root-scoped SW already intercepts /file:/ and serves game assets from its OPFS,
// so under the proxy we must NOT register our own.
const SAME_ORIGIN_PROXY = import.meta.env.BASE_URL.startsWith("/__player");

const connection = new Port2MessageConnection(
  (message: any, transfer?: Transferable[]) =>
    // `replyTargetOrigin || "*"` guards against an unset value ever reaching
    // postMessage as `undefined` (which throws "Invalid target origin").
    window.parent.postMessage(message, replyTargetOrigin || "*", transfer),
  // Incoming-origin filter (Port2MessageConnection.canConnect): strict in prod,
  // permissive on localhost dev so a drifted editor port can't reject connects.
  IS_LOCALHOST ? undefined : SPARKDOWN_EDITOR_ORIGIN,
);
connection.listen();

connection.addEventListener("message", async (e) => {
  const message = e.data;
  if (isMessage(message)) {
    // Forward protocol messages from editor to player
    sendProtocolMessage(message);
    // Forward protocol responses and notifications from editor to service worker
    navigator.serviceWorker.controller?.postMessage(
      message,
      (message as any).result?.transfer || (message as any).params?.transfer,
    );
  }
});

const workspaceState = installWorkspaceWorker(connection);

// Stays a raw bus listener (not the typed `onProtocolMessage` helper): it's a
// generic relay that forwards EVERY message bubbling up from the player
// (`e.target !== window`) to the editor, discriminating on target rather than
// message type — which a type-keyed handler can't express.
window.addEventListener(MessageProtocol.event, (e) => {
  if (e instanceof CustomEvent) {
    const message = e.detail;
    if (e.target !== window) {
      // Forward responses and notifications from player to editor
      connection.postMessage(
        message,
        message.result?.transfer || message.params?.transfer,
      );
    }
  }
});
window.addEventListener("dragenter", (e) => {
  e.preventDefault();
  e.stopPropagation();
  connection.postMessage(DraggedFilesInMessage.type.notification({}));
});
window.addEventListener("dragleave", (e) => {
  e.preventDefault();
  e.stopPropagation();
  connection.postMessage(DraggedFilesOutMessage.type.notification({}));
});
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
  connection.postMessage(DraggedFilesOverMessage.type.notification({}));
});
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const files = await Promise.all(
    Array.from(e.dataTransfer?.files || []).map(async (f) => {
      const name = f.name;
      const buffer = await f.arrayBuffer();
      return {
        name,
        buffer,
      };
    }),
  );
  connection.postMessage(
    DroppedFilesMessage.type.notification({ files }),
    files.map((f) => f.buffer),
  );
});

// Register our own SW only when we are genuinely a SEPARATE origin from the
// editor: neither the (prod-correct) origin compare nor the (dev-proxy-robust)
// build-base signal says same-origin. Skipping when EITHER is true keeps the
// production same-origin behavior intact while fixing the dev case where a
// stale baked editor origin made `SAME_ORIGIN` wrongly false.
if (!SAME_ORIGIN && !SAME_ORIGIN_PROXY && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js", { type: "module" })
    .catch((err) => console.error("SW register failed:", err));

  navigator.serviceWorker.addEventListener("message", (e) => {
    const message = e.data;
    // Forward protocol messages from service worker to editor
    connection.postMessage(
      message,
      message.result?.transfer || message.params?.transfer,
    );
  });
}

const load = async () => {
  // Workspace singleton must be set before the controller instantiates.
  setWorkspace(workspaceState.workspace);
  await Promise.allSettled([SparkWebPlayerElement.register()]);
};

load();
