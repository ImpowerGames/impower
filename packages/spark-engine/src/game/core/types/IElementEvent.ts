import { IEvent } from "./IEvent";

export interface IElementEvent<T extends string> extends IEvent<T> {
  /** The id of the element the event originated from */
  readonly targetId: string | null;
  /** The id of the element listened to */
  readonly currentTargetId: string | null;
}
