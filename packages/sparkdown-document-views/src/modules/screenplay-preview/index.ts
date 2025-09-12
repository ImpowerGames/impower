import Main from "./main/sparkdown-screenplay-preview";

export default abstract class SparkScreenplayPreview {
  static async init(options?: { tag?: string }) {
    const name = options?.tag ?? Main.tag;
    customElements.define(name, Main);
    return customElements.whenDefined(name);
  }
}
