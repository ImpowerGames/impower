import { DocumentLocation } from "./DocumentLocation";

export interface StackFrame {
  /** An identifier for the stack frame. It must be unique across all threads.
    This id can be used to retrieve the scopes of the frame with the `scopes` request or to restart the execution of a stack frame.
  */
  id: number;

  /** The name of the stack frame, typically a method name. */
  name: string;

  /** The source of the frame. */
  location: DocumentLocation;

  /** Indicates whether this frame can be restarted with the `restartFrame` request. Clients should only use this if the debug adapter supports the `restart` request and the corresponding capability `supportsRestartFrame` is true. If a debug adapter has this capability, then `canRestart` defaults to `true` if the property is absent. */
  canRestart?: boolean;

  /** The module associated with this frame, if any. */
  moduleId?: number | string;

  /** A hint for how to present this frame in the UI.
      A value of `label` can be used to indicate that the frame is an artificial frame that is used as a visual label or separator. A value of `subtle` can be used to change the appearance of a frame in a 'subtle' way.
    */
  presentationHint?: "normal" | "label" | "subtle";
}
