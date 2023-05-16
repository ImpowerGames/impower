export default abstract class Transformers {
  protected static _map?: Record<string, (v: string) => string>;

  static all() {
    return this._map;
  }

  static get(name: string) {
    return this._map?.[name];
  }

  static init(transformers: Record<string, (v: string) => string>): void {
    this._map = transformers;
  }
}
