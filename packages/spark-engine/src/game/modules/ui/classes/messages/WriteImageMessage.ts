import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { MorphRef, MorphTiming } from "@impower/sparkdown/src/morph/types";
import type { Animation } from "../../types/Animation";

export interface WriteImageInstruction {
  control: "show" | "hide" | "animate";
  targetAnimations?: Animation[];
  affected?: { target: string; animations: Animation[] }[];
  content?: {
    background: string;
    imageNames: string;
    src?: string;
    srcs: string[];
    video?: {
      src: string;
      loop: boolean;
      muted: boolean;
      mixer: string;
      mixerGain: number;
      preview?: boolean;
    };
    enterAnimation?: Animation;
    exitAnimation?: Animation;
    previousHideAnimation?: Animation;
    morph?: MorphImageContent;
  };
}

export interface MorphLayerPlay {
  layer: number;
  ref: MorphRef;
  timing: MorphTiming;
  definition: string;
}

export interface MorphImageContent {
  plays: MorphLayerPlay[];
  epoch: number;
}

export type WriteImageMethod = typeof WriteImageMessage.method;

export interface WriteImageParams {
  target: string;
  instructions: WriteImageInstruction[];
  instant: boolean;
  time?: number;
  elements?: string[];
}

export class WriteImageMessage {
  static readonly method = "ui/write-image";
  static readonly type = new MessageProtocolRequestType<
    WriteImageMethod,
    WriteImageParams,
    string
  >(WriteImageMessage.method);
}

export interface WriteImageMessageMap extends Record<string, [any, any]> {
  [WriteImageMessage.method]: [
    ReturnType<typeof WriteImageMessage.type.request>,
    ReturnType<typeof WriteImageMessage.type.response>,
  ];
}
