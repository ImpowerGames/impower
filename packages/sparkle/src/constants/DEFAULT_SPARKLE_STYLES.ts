import sparkleAnimations from "../styles/animations/animations.css";
import sparkleDark from "../styles/dark/dark.css";
import sparkleEasings from "../styles/easings/easings.css";
import sparkleElements from "../styles/elements/elements.css";
import sparkleGradients from "../styles/gradients/gradients.css";
import sparkleKeyframes from "../styles/keyframes/keyframes.css";
import sparkleLight from "../styles/light/light.css";
import sparkleMasks from "../styles/masks/masks.css";
import sparklePatterns from "../styles/patterns/patterns.css";
import sparkleShadows from "../styles/shadows/shadows.css";
import sparkleTheme from "../styles/theme/theme.css";

const DEFAULT_SPARKLE_STYLES = {
  sparkleDark,
  sparkleLight,
  sparkleTheme,
  sparkleElements,
  sparkleShadows,
  sparkleGradients,
  sparkleMasks,
  sparkleEasings,
  sparkleKeyframes,
  sparkleAnimations,
  sparklePatterns,
} as const;

export default DEFAULT_SPARKLE_STYLES;
