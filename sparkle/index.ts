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
import animations from "./src/styles/animations/animations.css";
import dark from "./src/styles/dark/dark.css";
import easings from "./src/styles/easings/easings.css";
import global from "./src/styles/global/global.css";
import gradients from "./src/styles/gradients/gradients.css";
import icons from "./src/styles/icons/icons.css";
import keyframes from "./src/styles/keyframes/keyframes.css";
import light from "./src/styles/light/light.css";
import masks from "./src/styles/masks/masks.css";
import patterns from "./src/styles/patterns/patterns.css";
import shadows from "./src/styles/shadows/shadows.css";
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

export const DEFAULT_SPARKLE_STYLES: Record<SparkleStyleType, string> = {
  global,
  light,
  dark,
  icons,
  shadows,
  gradients,
  masks,
  easings,
  keyframes,
  animations,
  patterns,
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
