export const assetsBuiltinDefinitions = () => ({
  config: {
    assets: {
      predict_distance: 32,
      predict_cache_size: 300,
      load_cache_size: 0,
      load_distance: 0,
      beat_timeout: 8,
      restore_timeout: 2,
      load_timeout: 30,
      loading_min: 0.5,
      loading_transition: "fade",
    },
  },
});

export interface AssetsBuiltins extends ReturnType<
  typeof assetsBuiltinDefinitions
> {}

export type AssetsConfig = AssetsBuiltins["config"]["assets"];
