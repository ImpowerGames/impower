import { DeleteFilesParams, FileData } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WillDeleteFilesMethod = typeof WillDeleteFilesMessage.method;

export interface WillDeleteFilesParams extends DeleteFilesParams {
  /**
   * `"trash"` moves the files into the project's local `.trash/` (reversible —
   * see the recycle-bin feature); `"permanent"` (the default) hard-deletes the
   * bytes from OPFS. User-initiated deletes request `"trash"`; the bundle/sync
   * diff-deletes and other internal callers keep the default `"permanent"`.
   */
  mode?: "trash" | "permanent";
}

export class WillDeleteFilesMessage {
  static readonly method = "workspace/willDeleteFiles";
  static readonly type = new MessageProtocolRequestType<
    WillDeleteFilesMethod,
    WillDeleteFilesParams,
    FileData[]
  >(WillDeleteFilesMessage.method);
}
