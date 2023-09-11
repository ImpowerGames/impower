import Badge from "../components/badge/badge";
import Box from "../components/box/box";
import Button from "../components/button/button";
import Circle from "../components/circle/circle";
import Collapsible from "../components/collapsible/collapsible";
import Dialog from "../components/dialog/dialog";
import Divider from "../components/divider/divider";
import Drawer from "../components/drawer/drawer";
import Dropdown from "../components/dropdown/dropdown";
import Hidden from "../components/hidden/hidden";
import Icon from "../components/icon/icon";
import Input from "../components/input/input";
import List from "../components/list/list";
import Option from "../components/option/option";
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

const DEFAULT_SPARKLE_CONSTRUCTORS = [
  Hidden,
  Box,
  List,
  Viewport,
  ScrollBlocker,
  Circle,
  Icon,
  Popup,
  Divider,
  ProgressBar,
  ProgressCircle,
  Ripple,
  Skeleton,
  Badge,
  Collapsible,
  Input,
  Button,
  Option,
  Tab,
  Tabs,
  Tooltip,
  Dropdown,
  ToastStack,
  Toast,
  Drawer,
  Dialog,
  SplitPane,
  Transition,
  Router,
] as const;

export default DEFAULT_SPARKLE_CONSTRUCTORS;
