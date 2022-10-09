export type ScaleModeType =
  /**
   * No scaling happens at all.
   */
  | "None"
  /**
   * The height is automatically adjusted based on the width.
   */
  | "WidthControlsHeight"

  /**
   * The width is automatically adjusted based on the height.

   */
  | "HeightControlsWidth"

  /**
   * The width and height are automatically adjusted to fit inside the given target area,
   * while keeping the aspect ratio. Depending on the aspect ratio there may be some space
   * inside the area which is not covered.
   */
  | "Fit"

  /**
   * The width and height are automatically adjusted to make the size cover the entire target
   * area while keeping the aspect ratio. This may extend further out than the target size.
   */
  | "Envelop"

  /**
   * The Canvas is resized to fit all available _parent_ space, regardless of aspect ratio.
   */
  | "Resize";
