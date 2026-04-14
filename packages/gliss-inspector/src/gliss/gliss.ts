import css from "./gliss.css?raw";

export interface GlissConfigItem {
  name: string;
  options?: unknown[];
  initial?: unknown;
  min?: number;
  max?: number;
  step?: number;
}

export type GlissConfig = Record<string, GlissConfigItem>;
export type GlissValues = Record<string, any>;

export interface GlissState {
  isDragging: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  mode: "vertical" | "horizontal" | null;
  initialValue: any;
  initialBaseOffset: number;
  hasInteracted: boolean;
  isMenuForcedOpen: boolean;
}

export type OnChangeCallback = (
  key: string,
  value: any,
  values: GlissValues,
) => void;
export type SimpleCallback = () => void;

export class Gliss {
  public static get css() {
    return css;
  }

  private container: HTMLElement;
  private onChange?: OnChangeCallback;
  private onInteractStart?: SimpleCallback;
  private onInteractEnd?: SimpleCallback;
  private onTap?: SimpleCallback;

  private activeIndex: number = 0;
  private itemHeight: number = 48;
  private enabled: boolean = false;

  private config: GlissConfig = {};
  private values: GlissValues = {};
  private keys: string[] = [];

  private state: GlissState = {
    isDragging: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    mode: null,
    initialValue: 0,
    initialBaseOffset: 0,
    hasInteracted: false,
    isMenuForcedOpen: false,
  };

  private settings = { threshold: 8 };

  // DOM Elements
  private overlay!: HTMLDivElement;
  private topBar!: HTMLDivElement;
  private valueText!: HTMLDivElement;
  private progressFill!: HTMLDivElement;
  private menuViewport!: HTMLDivElement;
  private arrowUp!: HTMLDivElement;
  private arrowDown!: HTMLDivElement;
  private selectionHighlight!: HTMLDivElement;
  private highlightContent!: HTMLDivElement;
  private menuContent!: HTMLDivElement;
  private menuItems: Record<string, HTMLDivElement> = {};

  constructor(
    container: HTMLElement,
    callbacks: {
      onChange?: OnChangeCallback;
      onInteractStart?: SimpleCallback;
      onInteractEnd?: SimpleCallback;
      onTap?: SimpleCallback;
    },
  ) {
    this.container = container;
    this.onChange = callbacks?.onChange;
    this.onInteractStart = callbacks?.onInteractStart;
    this.onInteractEnd = callbacks?.onInteractEnd;
    this.onTap = callbacks?.onTap;

    this.initUI();
    this.bindEvents();
  }

  private initUI(): void {
    this.container.classList.add("gliss-editor-container");
    this.overlay = document.createElement("div");
    this.overlay.className = "gliss-ui-overlay";

    this.topBar = document.createElement("div");
    this.topBar.className = "gliss-top-bar";

    this.valueText = document.createElement("div");
    this.valueText.className = "gliss-value-text";

    const track = document.createElement("div");
    track.className = "gliss-progress-track";

    this.progressFill = document.createElement("div");
    this.progressFill.className = "gliss-progress-fill";

    track.appendChild(this.progressFill);
    this.topBar.appendChild(this.valueText);
    this.topBar.appendChild(track);

    this.menuViewport = document.createElement("div");
    this.menuViewport.className = "gliss-menu-viewport";

    this.arrowUp = document.createElement("div");
    this.arrowUp.className = "menu-arrow menu-arrow-up";

    this.arrowDown = document.createElement("div");
    this.arrowDown.className = "menu-arrow menu-arrow-down";

    this.selectionHighlight = document.createElement("div");
    this.selectionHighlight.className = "gliss-selection-highlight";

    this.highlightContent = document.createElement("div");
    this.highlightContent.className = "gliss-highlight-flex";
    this.selectionHighlight.appendChild(this.highlightContent);

    this.menuContent = document.createElement("div");
    this.menuContent.className = "gliss-menu-content";
    this.menuItems = {};

    this.menuViewport.appendChild(this.selectionHighlight);
    this.menuViewport.appendChild(this.arrowUp);
    this.menuViewport.appendChild(this.menuContent);
    this.menuViewport.appendChild(this.arrowDown);

    this.overlay.appendChild(this.topBar);
    this.overlay.appendChild(this.menuViewport);
    this.container.appendChild(this.overlay);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.menuViewport.classList.remove("active");
      this.topBar.classList.remove("active");
      this.state.mode = null;
    }
  }

  public loadConfig(config: GlissConfig, values: GlissValues): void {
    this.config = config || {};
    this.values = { ...values };
    this.keys = Object.keys(this.config);
    this.activeIndex = 0;

    this.menuContent.innerHTML = "";
    this.menuItems = {};

    this.keys.forEach((key) => {
      const item = document.createElement("div");
      item.className = "gliss-menu-item";

      const label = document.createElement("span");
      label.innerText = this.config[key]?.name || key;

      const valDisplay = document.createElement("span");
      valDisplay.className = "menu-item-value";

      item.appendChild(label);
      item.appendChild(valDisplay);
      this.menuContent.appendChild(item);
      this.menuItems[key] = item;
    });

    this.renderMenu(false);
    this.menuViewport.classList.remove("active");
    this.state.isMenuForcedOpen = false;
  }

  private bindEvents(): void {
    const start = this.onStart.bind(this) as EventListener;
    const move = this.onMove.bind(this) as EventListener;
    const end = this.onEnd.bind(this) as EventListener;

    this.container.addEventListener("touchstart", start, { passive: false });
    this.container.addEventListener("touchmove", move, { passive: false });
    this.container.addEventListener("touchend", end);
    this.container.addEventListener("mousedown", start);

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
  }

  private getClientCoordinates(e: TouchEvent | MouseEvent): {
    clientX: number;
    clientY: number;
  } {
    if ("touches" in e && e.touches.length > 0 && e.touches[0]) {
      return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    }
    return {
      clientX: (e as MouseEvent).clientX,
      clientY: (e as MouseEvent).clientY,
    };
  }

  private onStart(e: TouchEvent | MouseEvent): void {
    if ("touches" in e && e.touches.length > 1) return;
    if (this.keys.length === 0) return;

    const { clientX, clientY } = this.getClientCoordinates(e);

    this.state.isDragging = true;
    this.state.isMenuForcedOpen = false;
    this.state.startX = clientX;
    this.state.startY = clientY;
    this.state.mode = null;

    if (this.enabled) {
      const activeKey = this.keys[this.activeIndex];
      if (activeKey) {
        this.state.initialValue = this.values[activeKey];
        this.state.initialBaseOffset =
          -(this.activeIndex + 0.5) * this.itemHeight;
        this.menuContent.classList.remove("snapping");
      }
    }
  }

  private onMove(e: TouchEvent | MouseEvent): void {
    if (!this.state.isDragging) return;
    if (e.cancelable) e.preventDefault();

    const { clientX, clientY } = this.getClientCoordinates(e);
    const deltaX = clientX - this.state.startX;
    const deltaY = clientY - this.state.startY;

    if (!this.state.mode) {
      if (
        Math.abs(deltaX) > this.settings.threshold ||
        Math.abs(deltaY) > this.settings.threshold
      ) {
        if (!this.enabled) {
          this.state.isDragging = false; // Cancel tap if dragged while disabled
          return;
        }
        this.onInteractStart?.();
        if (Math.abs(deltaY) > Math.abs(deltaX)) {
          this.state.mode = "vertical";
          this.menuViewport.classList.add("active");
          this.topBar.classList.remove("active");
        } else {
          this.state.mode = "horizontal";
          this.topBar.classList.add("active");
          this.menuViewport.classList.remove("active");
        }
      }
    }

    if (!this.enabled) return;

    if (this.state.mode === "vertical") {
      this.handleVerticalDrag(deltaY);
    } else if (this.state.mode === "horizontal") {
      this.handleHorizontalDrag(deltaX);
    }
  }

  private onEnd(): void {
    if (!this.state.isDragging) return;
    this.state.isDragging = false;

    if (this.state.mode === "vertical") {
      this.renderMenu(true);
    } else if (this.state.mode === null && this.onTap) {
      this.onTap();
    }

    if (!this.enabled) return;

    if (!this.state.isMenuForcedOpen) {
      this.menuViewport.classList.remove("active");
    }
    this.topBar.classList.remove("active");

    if (!this.state.hasInteracted && this.state.mode) {
      this.state.hasInteracted = true;
      const inst = document.getElementById("instructions");
      if (inst) inst.classList.add("hidden");
    }

    if (this.state.mode === "horizontal") {
      this.onInteractEnd?.();
    }

    this.state.mode = null;
  }

  private handleVerticalDrag(deltaY: number): void {
    const newOffset = this.state.initialBaseOffset + deltaY;
    const maxOffset = -0.5 * this.itemHeight;
    const minOffset = -(this.keys.length - 0.5) * this.itemHeight;
    const boundedOffset = Math.max(minOffset, Math.min(maxOffset, newOffset));
    const newIndex = Math.round(boundedOffset / -this.itemHeight - 0.5);

    if (this.activeIndex !== newIndex) {
      this.activeIndex = newIndex;
    }

    this.menuContent.style.transform = `translateY(${boundedOffset}px)`;
    this.updateItemSelection();
    this.updateArrowVisibility();
    this.updateHighlightText();
  }

  private handleHorizontalDrag(deltaX: number): void {
    const activeKey = this.keys[this.activeIndex]!;
    const paramConfig = this.config[activeKey];
    const containerWidth = this.container.getBoundingClientRect().width;
    let newValue: any;

    if (paramConfig) {
      if (paramConfig.options) {
        const initialIndex = paramConfig.options.indexOf(
          this.state.initialValue,
        );
        const range = paramConfig.options.length - 1;
        let newIndex = Math.round(
          initialIndex + (deltaX / containerWidth) * range * 1.5,
        );
        newValue = paramConfig.options[Math.max(0, Math.min(range, newIndex))];
      } else {
        const max = paramConfig.max ?? 100;
        const min = paramConfig.min ?? 0;
        const range = max - min;
        let rawChange = (deltaX / containerWidth) * range * 1.3;
        let rawNewVal = this.state.initialValue + rawChange;

        if (paramConfig.step) {
          newValue =
            Math.round(rawNewVal / paramConfig.step) * paramConfig.step;
          newValue = Number(newValue.toFixed(5));
        } else {
          newValue = Math.round(rawNewVal);
        }
        newValue = Math.max(min, Math.min(max, newValue));
      }
    }

    if (this.values[activeKey] !== newValue) {
      this.values[activeKey] = newValue;
      if (paramConfig) {
        this.updateTopBarUI(activeKey, paramConfig, newValue);
      }
      this.updateItemValues();
      this.updateHighlightText();

      if (this.onChange) {
        this.onChange(activeKey, newValue, this.values);
      }
    }
  }

  private formatValue(key: string, val: any): string | number {
    const config = this.config[key];
    if (config && config.options) {
      if (typeof val === "boolean") return val ? "On" : "Off";
      return val;
    }
    return config.min != null && config.min < 0 && val > 0
      ? `+${val}`
      : val === 0
        ? "0"
        : val;
  }

  public renderMenu(animated: boolean = false): void {
    if (this.keys.length === 0) return;

    if (animated) this.menuContent.classList.add("snapping");
    else this.menuContent.classList.remove("snapping");

    this.menuContent.style.transform = `translateY(${-((this.activeIndex + 0.5) * this.itemHeight)}px)`;
    this.updateItemSelection();
    this.updateItemValues();
    this.updateArrowVisibility();
    this.updateHighlightText();
  }

  private updateItemSelection(): void {
    this.keys.forEach((key, index) => {
      const item = this.menuItems[key];
      if (item) {
        if (index === this.activeIndex) item.classList.add("selected");
        else item.classList.remove("selected");
      }
    });
  }

  private updateItemValues(): void {
    this.keys.forEach((key) => {
      const valueEl = this.menuItems[key]?.querySelector(
        ".menu-item-value",
      ) as HTMLElement | null;
      if (valueEl) {
        valueEl.innerText = String(this.formatValue(key, this.values[key]));
      }
    });
  }

  private updateHighlightText(): void {
    const key = this.keys[this.activeIndex];
    if (!key) return;
    const paramConfig = this.config[key];
    this.highlightContent.innerHTML = `<span>${paramConfig?.name || key}</span><span class="menu-item-value">${this.formatValue(key, this.values[key])}</span>`;
  }

  private updateArrowVisibility(): void {
    this.arrowUp.style.opacity = this.activeIndex === 0 ? "0" : "0.6";
    this.arrowDown.style.opacity =
      this.activeIndex === this.keys.length - 1 ? "0" : "0.6";
  }

  private updateTopBarUI(
    key: string,
    config: GlissConfigItem,
    value: any,
  ): void {
    if (config.options) {
      const displayStr =
        typeof value === "string"
          ? value.charAt(0).toUpperCase() + value.slice(1)
          : typeof value === "boolean"
            ? value
              ? "On"
              : "Off"
            : value;

      this.valueText.innerText = `${config.name || key} • ${displayStr}`;
      const index = config.options.indexOf(value);
      this.progressFill.style.left = "0";
      this.progressFill.style.right = "auto";
      this.progressFill.style.width = `${(config.options.length > 1 ? index / (config.options.length - 1) : 0) * 100}%`;
      return;
    }

    this.valueText.innerText = `${config.name || key} ${value > 0 ? `+${value}` : value}`;

    const min = config.min ?? 0;
    const max = config.max ?? 100;
    const percentage =
      min < 0 && max > 0 ? Math.abs(value) / max : (value - min) / (max - min);

    if (min < 0 && max > 0) {
      const w = percentage * 50;
      if (value >= 0) {
        this.progressFill.style.left = "50%";
        this.progressFill.style.right = "auto";
        this.progressFill.style.width = `${w}%`;
      } else {
        this.progressFill.style.right = "50%";
        this.progressFill.style.left = "auto";
        this.progressFill.style.width = `${w}%`;
      }
    } else {
      this.progressFill.style.left = "0";
      this.progressFill.style.right = "auto";
      this.progressFill.style.width = `${percentage * 100}%`;
    }
  }

  public toggleMenu(): void {
    if (this.keys.length === 0) return;
    this.state.isMenuForcedOpen = !this.state.isMenuForcedOpen;

    if (this.state.isMenuForcedOpen) {
      this.menuViewport.classList.add("active");
      this.renderMenu(false);
    } else {
      this.menuViewport.classList.remove("active");
    }
  }
}
