import type { PreviewPoint } from "./WorkerDisplayWorkspace";

export class SetAsidePoints {
  static revision(documentsRevision: number, filesRevision: number) {
    return `${documentsRevision} ${filesRevision}`;
  }

  protected _points = new Set<string>();

  protected _all = false;

  protected _revision?: string;

  constructor(protected _currentRevision: () => string) {}

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

  withholdAll() {
    this.current();
    this._all = true;
  }

  get any() {
    this.current();
    return this._all || this._points.size > 0;
  }

  get all() {
    this.current();
    return this._all;
  }

  has(point: PreviewPoint) {
    this.current();
    return this._all || this._points.has(`${point.file}:${point.line}`);
  }
}
