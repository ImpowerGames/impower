// Kept in sync with `define assets as config` in the builtins prelude
// (packages/sparkdown/src/compiler/builtins/builtins.sd). The runtime reads the
// prelude; this mirror supplies the types and the defaults the module falls
// back on, and a parity test pins the two together.
export const assetsBuiltinDefinitions = () => ({
  config: {
    assets: {
      /** Beats ahead of the current one whose assets keep loading, through
       *  every branch. 0 means the rest of the current scene. */
      predict_distance: 32,
      /** Megabytes prediction may keep resident; pinned entries do not
       *  count. 0 means never evict. */
      predict_cache_size: 300,
      /** Megabytes `load` may pin across the loaded scenes on the callstack.
       *  0 means no cap. */
      load_cache_size: 0,
      /** Beats of a scene a `load` waits for. 0 means the whole scene. */
      load_distance: 0,
      /** Seconds a line may wait for its assets before displaying anyway. */
      beat_timeout: 8,
      /** Seconds a checkpoint restore or a layout mount may wait. */
      restore_timeout: 2,
      /** Seconds a `load` may wait before giving up and continuing. */
      load_timeout: 30,
      /** Seconds the `loading` layout stays up once a `load` opened it. */
      loading_min: 0.5,
      /** Transition for opening and closing `loading` when `load` has no
       *  `with` clause. */
      loading_transition: "fade",
    },
  },
});

export interface AssetsBuiltins extends ReturnType<
  typeof assetsBuiltinDefinitions
> {}

export type AssetsConfig = AssetsBuiltins["config"]["assets"];
