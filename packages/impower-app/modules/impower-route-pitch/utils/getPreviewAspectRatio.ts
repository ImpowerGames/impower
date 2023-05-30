// Force previews to be 1:1, 2:1, or 4:5
export const getPreviewAspectRatio = (
  intrinsicAspectRatio: number,
  square: boolean
): number =>
  square
    ? 1
    : intrinsicAspectRatio > 1
    ? 2
    : intrinsicAspectRatio < 1
    ? 0.8
    : 1;
