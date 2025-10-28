import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import Main from "./main/spark-web-player";

export default abstract class SparkWebPlayer {
  static async init(options: { tag?: string; workspace: SparkdownWorkspace }) {
    Main.workspace = options?.workspace;
    const name = options?.tag ?? Main.tag;
    customElements.define(name, Main);
    return customElements.whenDefined(name);
  }
}
