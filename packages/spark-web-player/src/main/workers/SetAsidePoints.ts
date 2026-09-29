import type { PreviewPoint } from "./WorkerDisplayWorkspace";

/**
 * The points of a script the preview is not to route to (#679): a route to
 * one ran without yielding until the player restarted its worker, and would
 * again. They are set aside until the project changes, which `revision`
 * says: whatever it answers when a point is set aside, a different answer
 * later lets every point go.
 *
 * A loop that lies on the route to many lines stops a route to each of
 * them, so setting aside one point at a time would cost a hang for every
 * line the author moves to. The second hang in one revision withholds every
 * point instead (`withholdAll`), until the project changes.
 */
export class SetAsidePoints {
  /** The revision the player's workspace keys set-aside points by: the edits
   *  to its open documents and the changes to its files, either of which
   *  lets every point go. */
  static revision(documentsRevision: number, filesRevision: number) {
    return `${documentsRevision} ${filesRevision}`;
  }

  protected _points = new Set<string>();

  protected _all = false;

  protected _revision?: string;

  constructor(protected _currentRevision: () => string) {}

  /** Start over if the project has changed since the points were set. */
  protected current() {
    const revision = this._currentRevision();
    if (this._revision !== revision) {
      this._points.clear();
      this._all = false;
      this._revision = revision;
    }
  }

  add(point: PreviewPoint) {
    this.current();
    this._points.add(`${point.file}:${point.line}`);
  }

  /** Withhold every point until the project changes. */
  withholdAll() {
    this.current();
    this._all = true;
  }

  /** Some point is set aside in this revision. */
  get any() {
    this.current();
    return this._all || this._points.size > 0;
  }

  /** Every point is withheld in this revision. */
  get all() {
    this.current();
    return this._all;
  }

  has(point: PreviewPoint) {
    this.current();
    return this._all || this._points.has(`${point.file}:${point.line}`);
  }
}
