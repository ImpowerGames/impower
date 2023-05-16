import Badge from "./src/components/badge/badge";
import Box from "./src/components/box/box";
import BreakpointObserver from "./src/components/breakpoint-observer/breakpoint-observer";
import Button from "./src/components/button/button";
import Circle from "./src/components/circle/circle";
import Collapsible from "./src/components/collapsible/collapsible";
import Dialog from "./src/components/dialog/dialog";
import Divider from "./src/components/divider/divider";
import Icon from "./src/components/icon/icon";
import Popup from "./src/components/popup/popup";
import ProgressBar from "./src/components/progress-bar/progress-bar";
import ProgressCircle from "./src/components/progress-circle/progress-circle";
import Ripple from "./src/components/ripple/ripple";
import Router from "./src/components/router/router";
import Skeleton from "./src/components/skeleton/skeleton";
import SplitLayout from "./src/components/split-layout/split-layout";
import Tab from "./src/components/tab/tab";
import Tabs from "./src/components/tabs/tabs";
import ToastStack from "./src/components/toast-stack/toast-stack";
import Toast from "./src/components/toast/toast";
import Tooltip from "./src/components/tooltip/tooltip";
import SparkleElement from "./src/core/sparkle-element";
import initialize from "./src/initialize/initialize";
import { ANIMATIONS_CSS } from "./src/styles/animations/animations";
import { DARK_CSS } from "./src/styles/dark/dark";
import { EASINGS_CSS } from "./src/styles/easings/easings";
import { GLOBAL_CSS } from "./src/styles/global/global";
import { GRADIENTS_CSS } from "./src/styles/gradients/gradients";
import { ICONS_CSS } from "./src/styles/icons/icons";
import { KEYFRAMES_CSS } from "./src/styles/keyframes/keyframes";
import { LIGHT_CSS } from "./src/styles/light/light";
import { MASKS_CSS } from "./src/styles/masks/masks";
import { PATTERNS_CSS } from "./src/styles/patterns/patterns";
import { SHADOWS_CSS } from "./src/styles/shadows/shadows";
import { SparkleElementTag } from "./src/types/sparkleElementTag";
import { SparkleStyleType } from "./src/types/sparkleStyleType";

export const DEFAULT_SPARKLE_CONSTRUCTORS: Record<
  SparkleElementTag,
  typeof SparkleElement
> = {
  "s-box": Box,
  "s-circle": Circle,
  "s-icon": Icon,
  "s-popup": Popup,
  "s-divider": Divider,
  "s-progress-bar": ProgressBar,
  "s-progress-circle": ProgressCircle,
  "s-ripple": Ripple,
  "s-skeleton": Skeleton,
  "s-badge": Badge,
  "s-collapsible": Collapsible,
  "s-button": Button,
  "s-tab": Tab,
  "s-tabs": Tabs,
  "s-tooltip": Tooltip,
  "s-toast-stack": ToastStack,
  "s-toast": Toast,
  "s-dialog": Dialog,
  "s-split-layout": SplitLayout,
  "s-router": Router,
  "s-breakpoint-observer": BreakpointObserver,
};

export const DEFAULT_SPARKLE_STYLES: Record<SparkleStyleType, CSSStyleSheet> = {
  global: GLOBAL_CSS,
  light: LIGHT_CSS,
  dark: DARK_CSS,
  icons: ICONS_CSS,
  shadows: SHADOWS_CSS,
  gradients: GRADIENTS_CSS,
  masks: MASKS_CSS,
  easings: EASINGS_CSS,
  keyframes: KEYFRAMES_CSS,
  animations: ANIMATIONS_CSS,
  patterns: PATTERNS_CSS,
};

export default abstract class Sparkle {
  static async init(
    styles = DEFAULT_SPARKLE_STYLES,
    constructors = DEFAULT_SPARKLE_CONSTRUCTORS,
    dependencies?: Record<SparkleElementTag, string>
  ): Promise<CustomElementConstructor[]> {
    return initialize(styles, constructors, dependencies);
  }
}
