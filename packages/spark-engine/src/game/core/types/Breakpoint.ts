import { DocumentLocation } from "./DocumentLocation";

export interface Breakpoint {
  /** If true, the breakpoint could be set (but not necessarily at the desired location). */
  verified: boolean;

  /** A message about the state of the breakpoint.
    This is shown to the user and can be used to explain why a breakpoint could not be verified.
  */
  message?: string;

  /** The source where the breakpoint is located. */
  location?: DocumentLocation;

  /** A machine-readable explanation of why a breakpoint may not be verified. If a breakpoint is verified or a specific reason is not known, the adapter should omit this property. Possible values include:
    
    - `pending`: Indicates a breakpoint might be verified in the future, but the adapter cannot verify it in the current state.
     - `failed`: Indicates a breakpoint was not able to be verified, and the adapter does not believe it can be verified without intervention.
  */
  reason?: "pending" | "failed";
}
