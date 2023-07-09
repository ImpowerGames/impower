import { Message } from "../Message";
import { Range } from "../Range";
import { ScreenplayOptions } from "../ScreenplayOptions";
import { TextDocumentItem } from "../TextDocumentItem";

export interface InitializeScreenplayParams {
  textDocument: TextDocumentItem;
  visibleRange: Range;
  selectedRange: Range;
  options: ScreenplayOptions;
}

export type InitializeScreenplayPreviewMethod =
  typeof InitializeScreenplay.method;

export interface InitializeScreenplayMessage
  extends Message<
    InitializeScreenplayPreviewMethod,
    InitializeScreenplayParams
  > {}

export class InitializeScreenplay {
  static readonly method = "screenplay/initialize";
  static is(obj: any): obj is InitializeScreenplayMessage {
    return obj.method === this.method;
  }
  static message(
    params: InitializeScreenplayParams
  ): InitializeScreenplayMessage {
    return {
      method: this.method,
      params,
    };
  }
}
