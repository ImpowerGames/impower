import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { MorphArtifact } from "@impower/sparkdown/src/morph/types";

export type MorphArtifactMethod = typeof MorphArtifactMessage.method;

/**
 * The artifact for a morph reference the page cannot resolve itself: one
 * with no asset service behind it (`MorphRef.src` absent), whose artwork
 * only the program holds, inline. The game bakes it and sends it once per
 * key and connection; `error` says why it could not, and the page keeps the
 * static image.
 */
export interface MorphArtifactParams {
  key: string;
  artifact?: MorphArtifact;
  error?: string;
}

export class MorphArtifactMessage {
  static readonly method = "morph/artifact";
  static readonly type = new MessageProtocolNotificationType<
    MorphArtifactMethod,
    MorphArtifactParams
  >(MorphArtifactMessage.method);
}
