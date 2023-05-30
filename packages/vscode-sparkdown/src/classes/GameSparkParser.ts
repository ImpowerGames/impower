import { compile, format } from "../../../spark-evaluate";
import { SparkParser, SparkParserConfig } from "../../../sparkdown";

export class GameSparkParser extends SparkParser {
  private static _instance: GameSparkParser;

  public static get instance(): GameSparkParser {
    if (!this._instance) {
      this._instance = new GameSparkParser();
    }
    return this._instance;
  }

  constructor(config?: SparkParserConfig, defaults?: string[]) {
    super(
      config || {
        compiler: compile,
        formatter: format,
      },
      defaults
    );
  }
}
