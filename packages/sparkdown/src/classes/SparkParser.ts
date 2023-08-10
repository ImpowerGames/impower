import { SparkParserConfig } from "../types/SparkParserConfig";
import { SparkProgram } from "../types/SparkProgram";
import parseSpark from "../utils/parseSpark";

export default class SparkParser {
  config: SparkParserConfig = {};

  constructor(config: SparkParserConfig) {
    this.config = config || this.config;
  }

  // TODO: Support incremental parsing
  parse(script: string, config?: SparkParserConfig): SparkProgram {
    const result = parseSpark(script, {
      ...(this.config || {}),
      ...(config || {}),
    });
    return result;
  }
}
