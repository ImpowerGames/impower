import SparkParser from "@impower/sparkdown/src/classes/SparkParser";

export class GameSparkParser extends SparkParser {
  private static _instance: GameSparkParser;

  public static get instance(): GameSparkParser {
    if (!this._instance) {
      this._instance = new GameSparkParser({});
    }
    return this._instance;
  }
}
