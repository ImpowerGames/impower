import transformer from "../../sparkle-style-transformer/src/index";
import { ComponentSpec } from "../../spec-component/src/spec";
import baseNormalize from "../../spec-component/src/styles/normalize/normalize.css";
import Badge from "./components/badge/_badge";
import Box from "./components/box/_box";
import Button from "./components/button/_button";
import Circle from "./components/circle/_circle";
import Collapsible from "./components/collapsible/_collapsible";
import Dialog from "./components/dialog/_dialog";
import Divider from "./components/divider/_divider";
import Drawer from "./components/drawer/_drawer";
import Dropdown from "./components/dropdown/_dropdown";
import Hidden from "./components/hidden/_hidden";
import Icon from "./components/icon/_icon";
import Input from "./components/input/_input";
import List from "./components/list/_list";
import Option from "./components/option/_option";
import Popup from "./components/popup/_popup";
import ProgressBar from "./components/progress-bar/_progress-bar";
import ProgressCircle from "./components/progress-circle/_progress-circle";
import Ripple from "./components/ripple/_ripple";
import Router from "./components/router/_router";
import ScrollBlocker from "./components/scroll-blocker/_scroll-blocker";
import Skeleton from "./components/skeleton/_skeleton";
import SplitPane from "./components/split-pane/_split-pane";
import Tab from "./components/tab/_tab";
import Tabs from "./components/tabs/_tabs";
import ToastStack from "./components/toast-stack/_toast-stack";
import Toast from "./components/toast/_toast";
import Tooltip from "./components/tooltip/_tooltip";
import Transition from "./components/transition/_transition";
import Viewport from "./components/viewport/_viewport";
import animations from "./styles/animations/animations.css";
import dark from "./styles/dark/dark.css";
import easings from "./styles/easings/easings.css";
import gradients from "./styles/gradients/gradients.css";
import {
  default as icons,
  default as iconsCSS,
} from "./styles/icons/icons.css";
import keyframes from "./styles/keyframes/keyframes.css";
import light from "./styles/light/light.css";
import masks from "./styles/masks/masks.css";
import normalize from "./styles/normalize/normalize.css";
import {
  default as patterns,
  default as patternsCSS,
} from "./styles/patterns/patterns.css";
import shadows from "./styles/shadows/shadows.css";
import theme from "./styles/theme/theme.css";

const config = {
  patterns: [patternsCSS],
  icons: [iconsCSS],
};

const style = <
  Props extends Record<string, unknown> = Record<string, unknown>,
  State extends Record<string, unknown> = Record<string, unknown>,
  Stores extends Record<string, any> = Record<string, any>,
  Context extends Record<string, unknown> = Record<string, unknown>,
  Selectors extends Record<string, string | string[]> = Record<
    string,
    string | string[]
  >
>(
  spec: ComponentSpec<Props, State, Stores, Context, Selectors>
): ComponentSpec<Props, State, Stores, Context, Selectors> => {
  return {
    ...spec,
    html: (args) => {
      const content = spec.html(args);
      return transformer(content, config);
    },
  };
};

const components = [
  { tag: "", css: baseNormalize },
  { tag: "", css: normalize },
  { tag: "", css: easings },
  { tag: "", css: keyframes },
  { tag: "", css: animations },
  { tag: "", css: gradients },
  { tag: "", css: icons },
  { tag: "", css: patterns },
  { tag: "", css: masks },
  { tag: "", css: dark },
  { tag: "", css: light },
  { tag: "", css: theme },
  { tag: "", css: shadows },
  style(Hidden),
  style(Box),
  style(List),
  style(Viewport),
  style(ScrollBlocker),
  style(Circle),
  style(Icon),
  style(Popup),
  style(Divider),
  style(ProgressBar),
  style(ProgressCircle),
  style(Ripple),
  style(Skeleton),
  style(Badge),
  style(Collapsible),
  style(Input),
  style(Button),
  style(Option),
  style(Tab),
  style(Tabs),
  style(Tooltip),
  style(Dropdown),
  style(ToastStack),
  style(Toast),
  style(Drawer),
  style(Dialog),
  style(SplitPane),
  style(Transition),
  style(Router),
] as const;

export default components;
