import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type SetEditorRouteMarksMethod = typeof SetEditorRouteMarksMessage.method;

export interface EditorChoiceMarkOption {
  text: string;
  taken: boolean;
  pinned: boolean;
}

export interface EditorChoiceMark {
  uri: string;
  line: number;
  icon: "pinned" | "auto";
  title: string;
  text: string;
  options: EditorChoiceMarkOption[];
  unpin: boolean;
}

export interface EditorForcedLines {
  uri: string;
  lines: number[];
}

export interface SetEditorRouteMarksParams {
  choices: EditorChoiceMark[];
  forced: EditorForcedLines[];
}

export interface SetEditorRouteMarksResult {}

export class SetEditorRouteMarksMessage {
  static readonly method = "editor/setRouteMarks";
  static readonly type = new MessageProtocolRequestType<
    SetEditorRouteMarksMethod,
    SetEditorRouteMarksParams,
    SetEditorRouteMarksResult
  >(SetEditorRouteMarksMessage.method);
}

export namespace SetEditorRouteMarksMessage {
  export interface Request extends RequestMessage<
    SetEditorRouteMarksMethod,
    SetEditorRouteMarksParams,
    SetEditorRouteMarksResult
  > {}
  export type Response = ResponseMessage<
    SetEditorRouteMarksMethod,
    SetEditorRouteMarksResult
  >;
}
