export interface AssetsConfig {
  predict_distance: number;
  predict_cache_size: number;
  load_cache_size: number;
  load_distance: number;
  beat_timeout: number;
  restore_timeout: number;
  load_timeout: number;
  loading_min: number;
  loading_transition?: string;
}

export interface AssetsBuiltins {
  config: {
    assets: Partial<Record<keyof AssetsConfig, unknown>>;
  };
}
