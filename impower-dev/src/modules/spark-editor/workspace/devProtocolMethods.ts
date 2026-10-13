// Control methods of the dev editor protocol socket, shared by the server
// (src/build/devProtocolSocket.ts) and the editor bridge. No dependencies, so
// both the Node build and the browser can import it.

/** Client to server: `{methods?: string[]}`; omitted means every notification, `[]` none. */
export const SUBSCRIBE_METHOD = "$/subscribe";

/** Server to editor only: the methods any socket client wants ("*" for all). */
export const BRIDGE_SUBSCRIPTIONS_METHOD = "$/bridgeSubscriptions";
