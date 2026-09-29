import type { PreviewPoint } from "./WorkerDisplayWorkspace";

/**
 * The points of a script the preview is not to route to (#679): a route to
 * one ran without yielding until the player restarted its worker, and would
 * again. They are set aside until the project changes, which `revision`
 * says: whatever it answers when a point is set aside, a different answer
 * later lets every point go.
 */
export class SetAsidePoints {
  protected _points = new Set<string>();

  protected _revision?: string;

  constructor(protected _currentRevision: () => string) {}

  add(point: PreviewPoint) {
    const revision = this._currentRevision();
    if (this._revision !== revision) {
      this._points.clear();
      this._revision = revision;
    }
    this._points.add(`${point.file}:${point.line}`);
  }

  has(point: PreviewPoint) {
    return (
      this._revision === this._currentRevision() &&
      this._points.has(`${point.file}:${point.line}`)
    );
  }
}
