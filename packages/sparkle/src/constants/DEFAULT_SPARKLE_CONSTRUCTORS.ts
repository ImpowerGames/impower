import Badge from "../components/badge/badge";
import Box from "../components/box/box";
import BreakpointObserver from "../components/breakpoint-observer/breakpoint-observer";
import Button from "../components/button/button";
import Circle from "../components/circle/circle";
import Collapsible from "../components/collapsible/collapsible";
import Dialog from "../components/dialog/dialog";
import Divider from "../components/divider/divider";
import Hidden from "../components/hidden/hidden";
import Icon from "../components/icon/icon";
import Popup from "../components/popup/popup";
import ProgressBar from "../components/progress-bar/progress-bar";
import ProgressCircle from "../components/progress-circle/progress-circle";
import Ripple from "../components/ripple/ripple";
import Router from "../components/router/router";
import ScrollBlocker from "../components/scroll-blocker/scroll-blocker";
import Skeleton from "../components/skeleton/skeleton";
import SplitPane from "../components/split-pane/split-pane";
import Tab from "../components/tab/tab";
import Tabs from "../components/tabs/tabs";
import ToastStack from "../components/toast-stack/toast-stack";
import Toast from "../components/toast/toast";
import Tooltip from "../components/tooltip/tooltip";
import Transition from "../components/transition/transition";
import Viewport from "../components/viewport/viewport";

const DEFAULT_SPARKLE_CONSTRUCTORS = {
  "s-hidden": Hidden,
  "s-box": Box,
  "s-viewport": Viewport,
  "s-scroll-blocker": ScrollBlocker,
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
  "s-split-pane": SplitPane,
  "s-transition": Transition,
  "s-router": Router,
  "s-breakpoint-observer": BreakpointObserver,
} as const;

export default DEFAULT_SPARKLE_CONSTRUCTORS;
