import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { MorphArtifact } from "@impower/sparkdown/src/morph/types";

export type MorphArtifactMethod = typeof MorphArtifactMessage.method;

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
