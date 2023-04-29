import Badge from "./src/components/badge/badge";
import Box from "./src/components/box/box";
import Button from "./src/components/button/button";
import Collapsible from "./src/components/collapsible/collapsible";
import Cutter from "./src/components/cutter/cutter";
import Divider from "./src/components/divider/divider";
import Icon from "./src/components/icon/icon";
import Popup from "./src/components/popup/popup";
import ProgressBar from "./src/components/progress-bar/progress-bar";
import ProgressCircle from "./src/components/progress-circle/progress-circle";
import Ripple from "./src/components/ripple/ripple";
import Router from "./src/components/router/router";
import Skeleton from "./src/components/skeleton/skeleton";
import Spinner from "./src/components/spinner/spinner";
import Tab from "./src/components/tab/tab";
import Tabs from "./src/components/tabs/tabs";
import Tooltip from "./src/components/tooltip/tooltip";

export { getAnimationNames } from "./src/animations/getAnimationNames";
export { getEasingNames } from "./src/animations/getEasingNames";
/* Events */
export { default as SpAfterCollapseEvent } from "./src/events/after-collapse";
export { default as SpAfterExpandEvent } from "./src/events/after-expand";
export { default as SpAfterHideEvent } from "./src/events/after-hide";
export { default as SpAfterShowEvent } from "./src/events/after-show";
export { default as SpBlurEvent } from "./src/events/blur";
export { default as SpCancelEvent } from "./src/events/cancel";
export { default as SpChangeEvent } from "./src/events/change";
export { default as SpClearEvent } from "./src/events/clear";
export { default as SpCloseEvent } from "./src/events/close";
export { default as SpCollapseEvent } from "./src/events/collapse";
export { default as SpErrorEvent } from "./src/events/error";
export { default as SpExpandEvent } from "./src/events/expand";
export { default as SpFinishEvent } from "./src/events/finish";
export { default as SpFocusEvent } from "./src/events/focus";
export { default as SpHideEvent } from "./src/events/hide";
export { default as SpHoverEvent } from "./src/events/hover";
export { default as SpInitialFocusEvent } from "./src/events/initial-focus";
export { default as SpInputEvent } from "./src/events/input";
export { default as SpInvalidEvent } from "./src/events/invalid";
export { default as SpLazyChangeEvent } from "./src/events/lazy-change";
export { default as SpLazyLoadEvent } from "./src/events/lazy-load";
export { default as SpLoadEvent } from "./src/events/load";
export { default as SpMutationEvent } from "./src/events/mutation";
export { default as SpRemoveEvent } from "./src/events/remove";
export { default as SpRepositionEvent } from "./src/events/reposition";
export { default as SpRequestCloseEvent } from "./src/events/request-close";
export { default as SpResizeEvent } from "./src/events/resize";
export { default as SpSelectEvent } from "./src/events/select";
export { default as SpSelectionChangeEvent } from "./src/events/selection-change";
export { default as SpShowEvent } from "./src/events/show";
export { default as SpSlideChange } from "./src/events/slide-change";
export { default as SpStartEvent } from "./src/events/start";
export { default as SpTabHideEvent } from "./src/events/tab-hide";
export { default as SpTabShowEvent } from "./src/events/tab-show";

export default class Sparkle {
  static async define(): Promise<CustomElementConstructor[]> {
    return Promise.all([
      Box.define(),
      Icon.define(),
      Popup.define(),
      Divider.define(),
      ProgressBar.define(),
      ProgressCircle.define(),
      Ripple.define(),
      Spinner.define(),
      Skeleton.define(),
      Badge.define(),
      Cutter.define(),
      Collapsible.define(),
      Button.define(),
      Tab.define(),
      Tabs.define(),
      Tooltip.define(),
      Router.define(),
    ]);
  }
}
