export interface CollisionBiasesConfig {
  /**
   * The maximum absolute difference of a Body's per-step velocity
   * and its overlap with another Body that will result in separation on each axis.
   * Larger values favor separation. Smaller values favor no separation.
   */
  overlapBias: number;
  /**
   * The maximum absolute value of a Body's overlap with a tile that will result in separation on each axis.
   * Larger values favor separation. Smaller values favor no separation.
   * The optimum value may be similar to the tile size.
   */
  tileBias: number;
  /**
   * Always separate overlapping Bodies horizontally before vertically.
   * False (the default) means Bodies are first separated on the axis of greater gravity,
   * or the vertical axis if neither is greater.
   */
  forceX: boolean;
}

export const createCollisionBiasesConfig = (
  obj?: Partial<CollisionBiasesConfig>
): CollisionBiasesConfig => ({
  overlapBias: 4,
  tileBias: 16,
  forceX: false,
  ...obj,
});
