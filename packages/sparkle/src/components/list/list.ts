import { SparkleComponent } from "../../core/sparkle-component";
import { getScrollableParent } from "../../utils/getScrollableParent";
import spec from "./_list";

export default class List<T = any> extends SparkleComponent(spec) {
  protected _buffer = 5;

  protected _ticking = false;

  protected _scroller: Element | Window | null = null;

  protected _cachedViewportHeight = 0;

  protected _cachedOffsetTop = 0;

  protected _scrollTimeout?: number;

  protected _renderFrameId: number | null = null;

  protected _parsedCache = new Map<number, HTMLTemplateElement | Node>();

  protected _items: T[] = [];
  get items() {
    return this._items;
  }
  set items(newItems) {
    this._items = newItems;
    this._parsedCache.clear();
    this._updateSpacer();
    this.requestRerender();
  }

  protected _itemHeight = 72;
  get itemHeight() {
    return this._itemHeight;
  }
  set itemHeight(height) {
    this._itemHeight = height;
    this._updateSpacer();
    this.requestRerender();
  }

  protected _renderItem?: (item: T, index: number) => Node | string;
  get renderItem() {
    return this._renderItem;
  }
  set renderItem(fn) {
    this._renderItem = fn;
    this._parsedCache.clear();
    this.requestRerender();
  }

  protected _onRenderStats?: (stats: {
    totalItems: number;
    renderedNodes: number;
    startIndex: number;
    endIndex: number;
  }) => void;
  get onRenderStats() {
    return this._onRenderStats;
  }
  set onRenderStats(fn) {
    this._onRenderStats = fn;
  }

  resizeObserver?: ResizeObserver;

  constructor() {
    super();
    this.onScroll = this.onScroll.bind(this);
  }

  override onConnected() {
    this.bindScroller();
  }

  override onDisconnected() {
    this.unbindScroller();
    if (this._renderFrameId !== null) {
      cancelAnimationFrame(this._renderFrameId);
    }
  }

  bindScroller() {
    requestAnimationFrame(() => {
      this._scroller = this._getScroller();

      if (this._scroller === this) {
        this.setAttribute("internal-scroller", "");
      } else {
        this.removeAttribute("internal-scroller");
      }

      this._updateMeasurements();

      this._scroller.addEventListener("scroll", this.onScroll, {
        passive: true,
      });

      this.resizeObserver = new ResizeObserver(() => {
        this._updateMeasurements();
        this.requestRerender();
      });
      this.resizeObserver.observe(
        this._scroller instanceof Window
          ? document.documentElement
          : this._scroller,
      );

      if (this._scroller !== this) {
        this.resizeObserver.observe(this);
      }

      this._updateSpacer();
      this.requestRerender();
    });
  }

  unbindScroller() {
    if (this._scroller) {
      this._scroller.removeEventListener("scroll", this.onScroll);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  _getScroller() {
    return getScrollableParent(this.parentNode as HTMLElement);
  }

  _updateMeasurements() {
    if (!this._scroller) return;

    if (this._scroller === this) {
      this._cachedViewportHeight = this.clientHeight;
      return;
    }

    const rect = this.getBoundingClientRect();

    if (this._scroller instanceof Window) {
      this._cachedOffsetTop = window.scrollY + rect.top;
      this._cachedViewportHeight = window.innerHeight;
    } else {
      const scrollerRect = this._scroller.getBoundingClientRect();
      this._cachedOffsetTop =
        this._scroller.scrollTop + rect.top - scrollerRect.top;
      this._cachedViewportHeight = this._scroller.clientHeight;
    }
  }

  _updateSpacer() {
    if (!this._items) return;

    const totalHeight = this._items.length * this._itemHeight;

    if (this._scroller === this || !this._scroller) {
      this.refs.spacer.style.height = `${totalHeight}px`;
      this.style.height = "";
    } else {
      this.refs.spacer.style.height = "0px";
      this.style.height = `${totalHeight}px`;
    }
  }

  onScroll() {
    if (!this.refs.content.classList.contains("scrolling")) {
      this.refs.content.classList.add("scrolling");
    }

    clearTimeout(this._scrollTimeout);
    this._scrollTimeout = setTimeout(() => {
      this.refs.content.classList.remove("scrolling");
    }, 150) as unknown as number;

    if (!this._ticking) {
      window.requestAnimationFrame(() => {
        this.requestRerender();
        this._ticking = false;
      });
      this._ticking = true;
    }
  }

  requestRerender() {
    if (this._renderFrameId) {
      window.cancelAnimationFrame(this._renderFrameId);
    }
    this._renderFrameId = requestAnimationFrame(() => {
      this._renderFrameId = null;
      this.rerender();
    });
  }

  rerender() {
    if (!this._items.length || !this._renderItem || !this._scroller) {
      this.refs.content.innerHTML = "";
      return;
    }

    let scrollTop = 0;
    let viewportHeight = 0;

    if (this._scroller === this) {
      scrollTop = this.scrollTop;
      viewportHeight = this.clientHeight;
    } else {
      if (this._scroller instanceof Window) {
        scrollTop = window.scrollY - (this._cachedOffsetTop || 0);
        viewportHeight = this._cachedViewportHeight || window.innerHeight;
      } else {
        scrollTop = this._scroller.scrollTop - (this._cachedOffsetTop || 0);
        viewportHeight =
          this._cachedViewportHeight || this._scroller.clientHeight;
      }
    }

    if (!viewportHeight) return;

    scrollTop = Math.max(0, scrollTop);

    let startIndex = Math.floor(scrollTop / this._itemHeight);
    let visibleCount = Math.ceil(viewportHeight / this._itemHeight);

    startIndex = Math.max(0, startIndex - this._buffer);
    const endIndex = Math.min(
      this._items.length,
      startIndex + visibleCount + 2 * this._buffer,
    );

    const offsetY = startIndex * this._itemHeight;
    this.refs.content.style.transform = `translateY(${offsetY}px)`;

    const requiredNodes = endIndex - startIndex;
    const currentNodes = this.refs.content.children;

    while (currentNodes.length < requiredNodes) {
      const rowWrapper = document.createElement("div");
      rowWrapper.style.boxSizing = "border-box";
      rowWrapper.style.width = "100%";
      this.refs.content.appendChild(rowWrapper);
    }

    while (currentNodes.length > requiredNodes) {
      this.refs.content.lastElementChild?.remove();
    }

    for (let i = 0; i < requiredNodes; i++) {
      const itemIndex = startIndex + i;
      const rowWrapper = currentNodes[i] as HTMLElement & {
        _renderedIndex: number;
      };

      rowWrapper.style.height = `${this._itemHeight}px`;

      if (rowWrapper._renderedIndex !== itemIndex) {
        let nodeContent: Node;

        if (!this._parsedCache.has(itemIndex)) {
          const rawContent = this._renderItem(
            this._items[itemIndex]!,
            itemIndex,
          );

          if (typeof rawContent === "string") {
            const template = document.createElement("template");
            template.innerHTML = rawContent;
            this._parsedCache.set(itemIndex, template);
          } else {
            this._parsedCache.set(itemIndex, rawContent);
          }
        }

        const cachedItem = this._parsedCache.get(itemIndex)!;
        if (cachedItem instanceof HTMLTemplateElement) {
          nodeContent = cachedItem.content.cloneNode(true);
        } else {
          nodeContent = cachedItem;
        }

        this.morph(rowWrapper, nodeContent);
        rowWrapper._renderedIndex = itemIndex;
      }
    }

    if (this._onRenderStats) {
      this._onRenderStats({
        totalItems: this._items.length,
        renderedNodes: requiredNodes,
        startIndex,
        endIndex,
      });
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-list": List;
  }
}
