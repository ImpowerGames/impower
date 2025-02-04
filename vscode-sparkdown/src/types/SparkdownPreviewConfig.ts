import { ScreenplayConfig } from "@impower/sparkdown-screenplay/src";

export interface SparkdownPreviewConfig extends ScreenplayConfig {
  game_preview_synchronized_with_cursor?: boolean;
  screenplay_preview_synchronized_with_cursor?: boolean;
  screenplay_preview_theme?: string;
  screenplay_preview_texture?: boolean;
  editor_newline_helper?: boolean;
  editor_refresh_stats_on_save?: boolean;
}
