import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { MorphMotion } from "@impower/sparkdown/src/morph/motion";
import type { MorphRef, MorphTiming } from "@impower/sparkdown/src/morph/types";
import type { Animation } from "../../types/Animation";

export interface PictureFraming {
  x: number;
  y: number;
  zoom: number;
}

export interface PictureTravel {
  framing?: PictureFraming;
  timing: { delay: string; duration: string; easing: string };
}

export interface WriteImageInstruction {
  control: "show" | "hide" | "animate";
  framing?: PictureFraming;
  travel?: PictureTravel;
  targetAnimations?: Animation[];
  affected?: { target: string; animations: Animation[] }[];
  content?: {
    background: string;
    imageNames: string;
    src?: string;
    srcs: string[];
    sources?: string[];
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

export interface MorphPictureFile {
  src: string;
  name: string;
  plays?: MorphPlay[];
  layer?: number;
}

export type MorphPlay = Omit<MorphLayerPlay, "layer" | "picture">;

export interface MorphPicture {
  span: number;
  files: MorphPictureFile[];
}

export interface MorphLayerPlay {
  layer: number;
  picture?: MorphPicture;
  ref: MorphRef;
  morph: string;
  timing: MorphTiming;
  motion?: MorphMotion;
  owner?: string;
  definition: string;
}

export interface MorphImageContent {
  plays: MorphLayerPlay[];
  epoch: number;
  still?: string;
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
