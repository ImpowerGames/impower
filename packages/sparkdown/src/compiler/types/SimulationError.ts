/**
 * A runtime error or warning that the replay of a route to a start point
 * raised, with the statement that raised it.
 *
 * The route is replayed where the search ran, which for the editor's preview
 * is a worker, while the game that shows the start point may be another game
 * that loads the replay's checkpoint and never runs the route itself. What the
 * replay raised travels with the checkpoint, so whichever game shows the start
 * point can report it.
 */
export interface SimulationError {
  message: string;
  /** 1 for an error and 2 for a warning, as the engine's `ErrorType` numbers
   *  them. */
  type: number;
  location: {
    uri: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  };
}
