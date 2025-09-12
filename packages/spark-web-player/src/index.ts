import Main from "./main/spark-web-player";

export default abstract class SparkWebPlayer {
  static async init(options?: { tag?: string }) {
    const name = options?.tag ?? Main.tag;
    customElements.define(name, Main);
    return customElements.whenDefined(name);
  }
}
