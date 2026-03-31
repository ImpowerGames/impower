import Main from "./main/sparkdown-screenplay-preview";

export default abstract class SparkScreenplayPreview {
  static async init(options?: { tag?: string }) {
    const name = options?.tag ?? Main.tag;
    if (!customElements.get(name)) {
      customElements.define(name, Main);
    }
    return customElements.whenDefined(name);
  }
}
