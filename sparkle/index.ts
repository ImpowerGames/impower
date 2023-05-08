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
import animationsCSS from "./src/themes/animations.css";
import darkCSS from "./src/themes/dark.css";
import easingsCSS from "./src/themes/easings.css";
import fontsCSS from "./src/themes/fonts.css";
import globalCSS from "./src/themes/global.css";
import gradientsCSS from "./src/themes/gradients.css";
import iconsCSS from "./src/themes/icons.css";
import keyframesCSS from "./src/themes/keyframes.css";
import lightCSS from "./src/themes/light.css";
import masksCSS from "./src/themes/masks.css";
import patternsCSS from "./src/themes/patterns.css";
import shadowsCSS from "./src/themes/shadows.css";
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

const globalSheet = new CSSStyleSheet();
globalSheet.replaceSync(globalCSS);
const lightSheet = new CSSStyleSheet();
lightSheet.replaceSync(lightCSS);
const darkSheet = new CSSStyleSheet();
darkSheet.replaceSync(darkCSS);
const fontsSheet = new CSSStyleSheet();
fontsSheet.replaceSync(fontsCSS);
const iconsSheet = new CSSStyleSheet();
iconsSheet.replaceSync(iconsCSS);
const shadowsSheet = new CSSStyleSheet();
shadowsSheet.replaceSync(shadowsCSS);
const gradientsSheet = new CSSStyleSheet();
gradientsSheet.replaceSync(gradientsCSS);
const masksSheet = new CSSStyleSheet();
masksSheet.replaceSync(masksCSS);
const easingsSheet = new CSSStyleSheet();
easingsSheet.replaceSync(easingsCSS);
const keyframesSheet = new CSSStyleSheet();
keyframesSheet.replaceSync(keyframesCSS);
const animationsSheet = new CSSStyleSheet();
animationsSheet.replaceSync(animationsCSS);
const patternsSheet = new CSSStyleSheet();
patternsSheet.replaceSync(patternsCSS);

export const DEFAULT_SPARKLE_STYLES: Record<SparkleStyleType, CSSStyleSheet> = {
  global: globalSheet,
  light: lightSheet,
  dark: darkSheet,
  fonts: fontsSheet,
  icons: iconsSheet,
  shadows: shadowsSheet,
  gradients: gradientsSheet,
  masks: masksSheet,
  easings: easingsSheet,
  keyframes: keyframesSheet,
  animations: animationsSheet,
  patterns: patternsSheet,
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
