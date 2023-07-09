import { SparkScreenplayConfig } from "@impower/spark-screenplay/src";

export interface SparkdownPreviewConfig extends SparkScreenplayConfig {
  game_preview_synchronized_with_cursor?: boolean;
  screenplay_preview_synchronized_with_cursor?: boolean;
  screenplay_preview_theme?: string;
  screenplay_preview_texture?: boolean;
  editor_parenthetical_newline_helper?: boolean;
  editor_refresh_stats_on_save?: boolean;
}
