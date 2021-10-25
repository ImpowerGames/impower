import { getPreviewAspectRatio } from "./getPreviewAspectRatio";

// Force previews to be 1:1, 2:1, or 4:5
export const getPreviewInnerStyle = (
  intrinsicAspectRatio: number,
  square: boolean,
  crop: number
): React.CSSProperties => {
  const previewAspectRatio = getPreviewAspectRatio(
    intrinsicAspectRatio,
    square
  );
  const positionHorizontally = intrinsicAspectRatio > previewAspectRatio;
  return {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: positionHorizontally
      ? `${crop * 100}% 0%`
      : `0% ${crop * 100}%`,
  };
};
