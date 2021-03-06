export enum CenterType {
  /**
   * The game canvas is not centered within the parent by Phaser.
   * You can still center it yourself via CSS.
   */
  NoCenter = "NoCenter",

  /**
   * The game canvas is centered both horizontally and vertically within the parent.
   * To do this, the parent has to have a bounds that can be calculated and not be empty.
   *
   * Centering is achieved by setting the margin left and top properties of the
   * game canvas, and does not factor in any other CSS styles you may have applied.
   */
  CenterBoth = "CenterBoth",

  /**
   * The game canvas is centered horizontally within the parent.
   * To do this, the parent has to have a bounds that can be calculated and not be empty.
   *
   * Centering is achieved by setting the margin left and top properties of the
   * game canvas, and does not factor in any other CSS styles you may have applied.
   */
  CenterHorizontally = "CenterHorizontally",

  /**
   * The game canvas is centered both vertically within the parent.
   * To do this, the parent has to have a bounds that can be calculated and not be empty.
   *
   * Centering is achieved by setting the margin left and top properties of the
   * game canvas, and does not factor in any other CSS styles you may have applied.
   */
  CenterVertically = "CenterVertically",
}
