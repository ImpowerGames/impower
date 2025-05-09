import animations from "../styles/animations/animations.css";
import dark from "../styles/dark/dark.css";
import easings from "../styles/easings/easings.css";
import elements from "../styles/elements/elements.css";
import gradients from "../styles/gradients/gradients.css";
import keyframes from "../styles/keyframes/keyframes.css";
import light from "../styles/light/light.css";
import masks from "../styles/masks/masks.css";
import patterns from "../styles/patterns/patterns.css";
import shadows from "../styles/shadows/shadows.css";
import theme from "../styles/theme/theme.css";

const DEFAULT_SPARKLE_STYLES = {
  dark,
  light,
  theme,
  elements,
  shadows,
  gradients,
  masks,
  easings,
  keyframes,
  animations,
  patterns,
} as const;

export default DEFAULT_SPARKLE_STYLES;
