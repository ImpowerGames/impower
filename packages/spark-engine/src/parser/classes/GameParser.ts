import { compile, format } from "../../../../spark-evaluate/src";
import { SparkParserConfig } from "../../../../sparkdown/src";
import SparkParser from "../../../../sparkdown/src/classes/SparkParser";
import { processBeatmap } from "../../game/rhythm";

export default class GameParser extends SparkParser {
  private static _instance: GameParser;

  public static get instance(): GameParser {
    if (!this._instance) {
      this._instance = new GameParser();
    }
    return this._instance;
  }

  constructor(config?: SparkParserConfig) {
    super({
      compiler: compile,
      formatter: format,
      extensions: [processBeatmap],
      ...(config || {}),
    });
  }
}
