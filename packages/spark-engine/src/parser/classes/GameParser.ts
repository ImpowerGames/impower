import compile from "../../../../spark-evaluate/src/utils/compile";
import format from "../../../../spark-evaluate/src/utils/format";
import SparkParser from "../../../../sparkdown/src/classes/SparkParser";
import type { SparkParserConfig } from "../../../../sparkdown/src/types/SparkParserConfig";
import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import processBeatmap from "../../game/modules/rhythm/utils/processBeatmap";

export default class GameParser extends SparkParser {
  private static _instance: GameParser;

  public static parse(
    script: string,
    config?: SparkParserConfig
  ): SparkProgram {
    if (!this._instance) {
      this._instance = new GameParser();
    }
    return this._instance.parse(script, config);
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
