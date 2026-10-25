import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";

export type MorphNeedMethod = typeof MorphNeedMessage.method;

/**
 * The page asks again for the artifact of a reference the game sent it
 * (`MorphArtifactMessage`), which it no longer holds: it let the artifact
 * go when its cache made room. The game answers keys of references it wrote
 * on this connection and ignores any other.
 */
export interface MorphNeedParams {
  key: string;
}

export class MorphNeedMessage {
  static readonly method = "morph/need";
  static readonly type = new MessageProtocolNotificationType<
    MorphNeedMethod,
    MorphNeedParams
  >(MorphNeedMessage.method);
}
