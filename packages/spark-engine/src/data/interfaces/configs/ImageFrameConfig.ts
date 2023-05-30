export interface ImageFrameConfig {
  /**
   * The width of the frame in pixels.
   */
  frameWidth: number;
  /**
   * The height of the frame in pixels. Uses the `frameWidth` value if not provided.
   */
  frameHeight?: number;
  /**
   * The first frame to start parsing from.
   */
  startFrame?: number;
  /**
   * The frame to stop parsing at. If not provided it will calculate the value based on the image and frame dimensions.
   */
  endFrame?: number;
  /**
   * The margin in the image. This is the space around the edge of the frames.
   */
  margin?: number;
  /**
   * The spacing between each frame in the image.
   */
  spacing?: number;
}
