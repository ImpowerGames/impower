import { FormattedText } from "../classes/Typesetter";
import { OutlineItem } from "./OutlineItem";
import { PrintProfile } from "./PrintProfile";
import { TextOptions } from "./TextOptions";

export type PDFFontSource = string | Uint8Array | ArrayBuffer;

export interface PdfDocument {
  outline?: OutlineItem;
  print?: PrintProfile;

  printText?: (
    content: FormattedText[],
    x: number,
    y: number,
    options?: TextOptions
  ) => void;
  textBox?: (
    content: FormattedText[],
    x: number,
    y: number,
    w: number,
    options?: TextOptions
  ) => void;

  text: (text: string, x?: number, y?: number, options?: TextOptions) => void;
  fill: (color: string) => void;
  highlight: (
    x: number,
    y: number,
    w: number,
    h: number,
    option?: { color?: string }
  ) => void;
  currentLineHeight: () => number;
  widthOfString: (text: string) => number;
  heightOfString: (text: string, options?: TextOptions) => number;
  registerFont: (name: string, src?: PDFFontSource, family?: string) => void;
  font: (src: PDFFontSource, size?: number) => void;
  fontSize: (size: number) => void;
  addPage: () => void;
  rotate: (angle: number, options?: { origin?: number[] | undefined }) => void;
  pipe(destination: unknown, options?: { end?: boolean | undefined }): unknown;
  on(eventName: string | symbol, listener: (...args: any[]) => void): this;
  end: () => void;
}
