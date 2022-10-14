import {
  InheritedPaintProvider,
  MaskServer,
  Paint,
  PaintProvider,
  SVGGraphicsNode,
  SVGImageNode,
  SVGSceneContext,
  SVGTextNode,
  SVGUseNode,
} from "@pixi-essentials/svg";
import { CanvasTextureAllocator } from "@pixi-essentials/texture-allocator";
import { Renderer, RenderTexture } from "@pixi/core";
import { Container } from "@pixi/display";
import { Matrix, Rectangle } from "@pixi/math";
import {
  Bounds,
  DisplayObject,
  IDestroyOptions,
  IPointData,
  ObservablePoint,
  Point,
  Ticker,
  UPDATE_PRIORITY,
} from "pixi.js";
import { drawSVGGraphics } from "../utils/drawSVGGraphics";
import { parseReference } from "../utils/parseReference";
import { AnimatedSVGPathNode } from "./AnimatedSVGPathNode";
import { AnimationControl } from "./AnimationControl";
import { SVGLoader } from "./SVGLoader";

const tempMatrix = new Matrix();
const tempRect = new Rectangle();
const tempPoint = new Point();

const DEFAULT_MAX_FPS = 60;

export interface AnimatedSVGOptions {
  maxFPS?: number;
  anchor?: ObservablePoint;
  autoUpdate?: boolean;
  time?: number;
  context?: Partial<SVGSceneContext>;
}

/**
 * {@link AnimatedGraphic} can be used to build an interactive viewer for scalable vector graphics images.
 *
 * ## AnimatedSVG Scene Graph
 *
 * AnimatedSVG has an internal, disconnected scene graph that is optimized for lazy updates. It will listen to the following
 * events fired by a node:
 *
 * * `nodetransformdirty`: This will invalidate the transform calculations.
 *
 * @public
 */
export class AnimatedGraphic extends DisplayObject {
  /**
   * Should children be sorted by zIndex at the next updateTransform call.
   *
   * Will get automatically set to true if a new child is added, or if a child's zIndex changes.
   */
  public sortDirty = false;

  /**
   * The speed that the AnimatedSVGSprite will play at. Higher is faster, lower is slower.
   */
  public animationSpeed = 1;

  /**
   * User-assigned function to call when an AnimatedSVGSprite changes which texture is being rendered.
   * @example
   * animation.onFrameChange = () => {
   *   // updated!
   * };
   */
  public onFrameChange?: (currentFrame: number) => void;

  /**
   * User-assigned function to call when `loop` is true, and an AnimatedSVGSprite is played and
   * loops around to start again.
   * @example
   * animation.onLoop = () => {
   *   // looped!
   * };
   */
  public onLoop?: (currentFrame: number, currentIteration: number) => void;

  /**
   * The SVG image content being rendered by the scene.
   */
  public content: SVGSVGElement;

  /**
   * The root display object of the scene.
   */
  public root?: Container;

  /**
   * Display objects that don't render to the screen, but are required to update before the rendering
   * nodes, e.g. mask sprites.
   */
  public renderServers: Container = new Container();

  /**
   * `true` uses Ticker.shared to auto update animation time.
   */
  protected _autoUpdate = false;

  /**
   * `true` if the instance is currently connected to Ticker.shared to auto update animation time.
   */
  protected _isConnectedToTicker = false;

  /** Elapsed time since animation has been started, used internally to display current texture. */
  protected _currentTime = 0;

  /**
   * The scene context
   */
  protected _context?: SVGSceneContext;

  /**
   * The width of the rendered scene in local space.
   */
  protected _width: number;

  /**
   * The height of the rendered scene in local space.
   */
  protected _height: number;

  protected _maxFPS?: number;

  protected _anchor: ObservablePoint;

  /**
   * Maps content elements to their paint. These paints do not inherit from their parent element. You must
   * compose an {@link InheritedPaintProvider} manually.
   */
  protected _elementToPaint: Map<SVGElement, Paint> = new Map();

  /**
   * Maps `SVGMaskElement` elements to their nodes. These are not added to the scene graph directly and are
   * only referenced as a `mask`.
   */
  protected _elementToMask: Map<SVGElement, MaskServer> = new Map();

  /**
   * Flags whether any transform is dirty in the SVG scene graph.
   */
  protected _transformDirty = true;

  /**
   * Used to control animation across all nodes
   */
  protected _control?: AnimationControl = new AnimationControl();

  /**
   * An array of sampled times for this animation
   */
  protected _frames: number[] = [0];

  /**
   * The current frame that is displayed
   */
  protected _currentFrameIndex = 0;

  /**
   * The original width and height of the svg
   */
  protected _orig: { width: number; height: number };

  /**
   * @param content - The SVG node to render
   * @param context - This can be used to configure the scene
   */
  constructor(content: SVGSVGElement, options?: AnimatedSVGOptions) {
    super();

    this.content = content;
    this._orig = {
      width: this.content.viewBox.baseVal.width,
      height: this.content.viewBox.baseVal.height,
    };

    this._maxFPS = options?.maxFPS;
    this._anchor =
      options?.anchor || new ObservablePoint(this.onAnchorUpdate, this, 0, 0);
    this._currentTime = options?.time || 0;
    this._control.time = options?.time || 0;
    this.initContext(options?.context);

    this._width = this._orig.width || 0;
    this._height = this._orig.height || 0;

    if (!options?.context?.disableRootPopulation) {
      this.populateScene();
    }

    this._autoUpdate =
      typeof options?.autoUpdate === "boolean" ? options?.autoUpdate : true;
    if (this.autoUpdate) {
      this.play();
    }
  }

  initContext(context?: Partial<SVGSceneContext>): void {
    context = context || {};
    context.atlas = context.atlas || new CanvasTextureAllocator(2048, 2048);
    context.disableHrefSVGLoading =
      typeof context.disableHrefSVGLoading === "undefined"
        ? false
        : context.disableHrefSVGLoading;

    this._context = context as SVGSceneContext;
  }

  calculateBounds(): void {
    this._bounds.clear();
    const minX = this._orig.width * -this._anchor._x;
    const minY = this._orig.height * -this._anchor._y;
    const maxX = this._orig.width * (1 - this._anchor._x);
    const maxY = this._orig.height * (1 - this._anchor._y);
    this._bounds.addFrameMatrix(this.worldTransform, minX, minY, maxX, maxY);
  }

  public getLocalBounds(rect?: Rectangle): Rectangle {
    if (!this._localBounds) {
      this._localBounds = new Bounds();
    }

    this._localBounds.minX = this._orig.width * -this._anchor._x;
    this._localBounds.minY = this._orig.height * -this._anchor._y;
    this._localBounds.maxX = this._orig.width * (1 - this._anchor._x);
    this._localBounds.maxY = this._orig.height * (1 - this._anchor._y);

    if (!rect) {
      if (!this._localBoundsRect) {
        this._localBoundsRect = new Rectangle();
      }

      rect = this._localBoundsRect;
    }

    return this._localBounds.getRectangle(rect);
  }

  /**
   * Tests if a point is inside this sprite
   * @param point - the point to test
   * @returns The result of the test
   */
  public containsPoint(point: IPointData): boolean {
    this.worldTransform.applyInverse(point, tempPoint);

    const width = this._orig.width;
    const height = this._orig.height;
    const x1 = -width * this.anchor.x;
    let y1 = 0;

    if (tempPoint.x >= x1 && tempPoint.x < x1 + width) {
      y1 = -height * this.anchor.y;

      if (tempPoint.y >= y1 && tempPoint.y < y1 + height) {
        return true;
      }
    }

    return false;
  }

  removeChild(): void {
    // Just to implement DisplayObject
  }

  /**
   * @override
   */
  render(renderer: Renderer): void {
    if (!this.visible || !this.renderable) {
      return;
    }

    // Update render-server objects
    this.renderServers.render(renderer);

    // Render the SVG scene graph
    if (this.root) {
      this.root.render(renderer);
    }
  }

  /**
   * @override
   */
  updateTransform(): void {
    super.updateTransform();

    if (!this.root) {
      return;
    }

    this.root.alpha = this.worldAlpha;

    const { worldTransform } = this;
    const rootTransform = this.root.transform.worldTransform;

    // Don't update transforms if they didn't change across frames. This is because the SVG scene graph is static.
    if (
      rootTransform.a === worldTransform.a &&
      rootTransform.b === worldTransform.b &&
      rootTransform.c === worldTransform.c &&
      rootTransform.d === worldTransform.d &&
      rootTransform.tx === worldTransform.tx &&
      rootTransform.ty === worldTransform.ty &&
      (rootTransform as unknown as { _worldID: number })._worldID !== 0 &&
      !this._transformDirty
    ) {
      return;
    }

    this.root.enableTempParent();
    const child = this.root.children?.[0];
    if (child) {
      child.pivot.x = (this.anchor.x * this.width) / this.scale.x;
      child.pivot.y = (this.anchor.y * this.height) / this.scale.y;
    }
    this.root.transform.setFromMatrix(this.worldTransform);
    this.root.updateTransform();
    this.root.disableTempParent(null as unknown as Container<DisplayObject>);

    // Calculate bounds in the SVG scene graph. This ensures they are updated whenever the transform changes.
    this.root.calculateBounds();

    // Prevent redundant recalculations.
    this._transformDirty = false;
  }

  /**
   * Creates a display object that implements the corresponding `embed*` method for the given node.
   *
   * @param element - The element to be embedded in a display object.
   */
  protected createNode(element: SVGElement): Container | undefined {
    let renderNode: Container | undefined = undefined;

    if (!element) {
      return renderNode;
    }
    const type = element.nodeName.toLowerCase();
    switch (type) {
      case "circle":
      case "ellipse":
      case "g":
      case "line":
      case "polyline":
      case "polygon":
      case "rect":
        if (this._context) {
          renderNode = new SVGGraphicsNode(this._context);
        }
        break;
      case "image":
        if (this._context) {
          renderNode = new SVGImageNode(this._context);
        }
        break;
      case "mask":
      case "svg":
        renderNode = new Container();
        break;
      case "path":
        if (this._context && this._control) {
          renderNode = new AnimatedSVGPathNode(
            this._context,
            this._control,
            this.content,
            element as SVGPathElement,
            element.children?.[0] as SVGAnimateElement
          );
        }
        break;
      case "text":
        renderNode = new SVGTextNode();
        break;
      case "use":
        renderNode = new SVGUseNode();
        break;
      default:
        renderNode = undefined;
        break;
    }

    return renderNode;
  }

  /**
   * Creates a `Paint` object for the given element. This should only be used when sharing the `Paint`
   * is not desired; otherwise, use {@link AnimatedGraphic.queryPaint}.
   *
   * This will return `null` if the passed element is not an instance of `SVGElement`.
   *
   * @alpha
   * @param element
   */
  protected createPaint(element: SVGElement): Paint | undefined {
    if (!(element instanceof SVGElement)) {
      return undefined;
    }

    return new PaintProvider(element);
  }

  /**
   * Creates a lazy luminance mask for the `SVGMaskElement` or its rendering node.
   *
   * @param ref - The `SVGMaskElement` or its rendering node, if already generated.
   */
  protected createMask(ref: SVGMaskElement | Container): MaskServer {
    if (ref instanceof SVGElement) {
      ref = this.populateSceneRecursive(ref, {
        basePaint: this.queryInheritedPaint(ref),
      }) as Container;
    }

    const localBounds = ref.getLocalBounds();

    ref.getBounds();

    const maskTexture = RenderTexture.create({
      width: localBounds.width,
      height: localBounds.height,
    });

    const maskSprite = new MaskServer(maskTexture);

    // Lazily render mask when needed.
    maskSprite.addChild(ref);

    return maskSprite;
  }

  /**
   * Returns the rendering node for a mask.
   *
   * @alpha
   * @param ref - The mask element whose rendering node is needed.
   */
  protected queryMask(ref: SVGMaskElement): MaskServer {
    let queryHit = this._elementToMask.get(ref);

    if (!queryHit) {
      queryHit = this.createMask(ref);

      this._elementToMask.set(ref, queryHit);
    }

    return queryHit;
  }

  /**
   * Returns the cached paint of a content element. The returned paint will not account for any paint
   * attributes inherited from ancestor elements.
   *
   * @alpha
   * @param ref - A reference to the content element.
   */
  protected queryPaint(ref: SVGElement): Paint | undefined {
    let queryHit = this._elementToPaint.get(ref);

    if (!queryHit) {
      queryHit = this.createPaint(ref);
      if (queryHit) {
        this._elementToPaint.set(ref, queryHit);
      }
    }

    return queryHit;
  }

  /**
   * Returns an (uncached) inherited paint of a content element.
   *
   * @alpha
   * @param ref
   */
  protected queryInheritedPaint(ref: SVGElement): Paint | undefined {
    const paint = this.queryPaint(ref);
    const parentPaint =
      ref.parentElement &&
      this.queryPaint(ref.parentElement as unknown as SVGElement);

    if (!parentPaint) {
      return paint;
    }

    return new InheritedPaintProvider(parentPaint, paint as Paint);
  }

  /**
   * Embeds a content `element` into the rendering `node`.
   *
   * This is **not** a stable API.
   *
   * @alpha
   * @param node - The node in this scene that will render the `element`.
   * @param element - The content `element` to be rendered. This must be an element of the SVG document
   *  fragment under `this.content`.
   * @param options - Additional options
   * @param {Paint} [options.basePaint] - The base paint that the element's paint should inherit from
   * @return The base attributes of the element, like paint.
   */
  protected embedIntoNode(
    node: Container,
    element: SVGGraphicsElement | SVGMaskElement,
    options: {
      basePaint?: Paint;
    } = {}
  ): {
    paint?: Paint;
  } {
    // Paint
    const { basePaint } = options;
    const paint = basePaint
      ? new InheritedPaintProvider(basePaint, this.queryPaint(element) as Paint)
      : this.queryPaint(element);

    // Transform
    const transform =
      element instanceof SVGGraphicsElement
        ? element.transform.baseVal.consolidate()
        : null;
    const transformMatrix = transform
      ? transform.matrix
      : tempMatrix.identity();

    // Graphics
    if (node instanceof AnimatedSVGPathNode) {
      node.bindPaint(paint);
    }
    if (node instanceof SVGGraphicsNode) {
      drawSVGGraphics(this.content, node, paint);
    }
    const type = element.nodeName.toLowerCase();
    switch (type) {
      case "circle":
        (node as SVGGraphicsNode).embedCircle(element as SVGCircleElement);
        break;
      case "ellipse":
        (node as SVGGraphicsNode).embedEllipse(element as SVGEllipseElement);
        break;
      case "image":
        (node as SVGImageNode).embedImage(element as SVGImageElement);
        break;
      case "line":
        (node as SVGGraphicsNode).embedLine(element as SVGLineElement);
        break;
      case "path":
        (node as AnimatedSVGPathNode).embedPath(element as SVGPathElement);
        break;
      case "polyline":
        (node as SVGGraphicsNode).embedPolyline(element as SVGPolylineElement);
        break;
      case "polygon":
        (node as SVGGraphicsNode).embedPolygon(element as SVGPolygonElement);
        break;
      case "rect":
        (node as SVGGraphicsNode).embedRect(element as SVGRectElement);
        break;
      case "text":
        (node as SVGTextNode).embedText(element as SVGTextElement);
        break;
      case "use": {
        const useElement = element as SVGUseElement;
        const useTargetURL =
          useElement.getAttribute("href") ||
          useElement.getAttribute("xlink:href");
        const usePaint = this.queryPaint(useElement);

        (node as SVGUseNode).embedUse(useElement);

        if (useTargetURL && useTargetURL.startsWith("#")) {
          const useTarget = this.content.querySelector(useTargetURL);
          const contentNode = this.populateSceneRecursive(
            useTarget as SVGGraphicsElement,
            {
              basePaint: usePaint,
            }
          ) as SVGGraphicsNode;

          (node as SVGUseNode).ref = contentNode;
          contentNode.transform.setFromMatrix(Matrix.IDENTITY); // clear transform
        } else if (
          this._context &&
          !this._context.disableHrefSVGLoading &&
          useTargetURL
        ) {
          (node as SVGUseNode).isRefExternal = true;

          SVGLoader.instance
            .load(useTargetURL)
            .then((svgDocument) =>
              svgDocument
                ? ([
                    new AnimatedGraphic(svgDocument, {
                      context: {
                        ...this._context,
                        disableRootPopulation: true,
                      },
                    }),
                    svgDocument.querySelector(`#${useTargetURL.split("#")[1]}`),
                  ] as [AnimatedGraphic, SVGElement])
                : []
            )
            .then(([shellScene, useTarget]) => {
              if (!useTarget) {
                console.error(
                  `AnimatedSVG failed to resolve ${useTargetURL} and SVGUseNode is empty!`
                );
              }

              const contentNode = shellScene.populateSceneRecursive(
                useTarget as SVGGraphicsElement,
                {
                  basePaint: usePaint,
                }
              ) as SVGGraphicsNode;

              (node as SVGUseNode).ref = contentNode;
              contentNode.transform.setFromMatrix(Matrix.IDENTITY); // clear transform

              this._transformDirty = true;

              shellScene.on("transformdirty", () => {
                this._transformDirty = true;
              });
            });
        }
        break;
      }
      default:
        // NoOp
        break;
    }

    node.transform.setFromMatrix(
      tempMatrix.set(
        transformMatrix.a,
        transformMatrix.b,
        transformMatrix.c,
        transformMatrix.d,
        transformMatrix instanceof Matrix
          ? transformMatrix.tx
          : transformMatrix.e,
        transformMatrix instanceof Matrix
          ? transformMatrix.ty
          : transformMatrix.f
      )
    );

    // Mask
    if (element instanceof SVGMaskElement) {
      this._elementToMask.set(element, this.createMask(node));
    }
    const maskURL = element.getAttribute("mask");
    if (maskURL) {
      const maskElement: SVGMaskElement | null = this.content.querySelector(
        parseReference(maskURL)
      );
      if (maskElement) {
        const maskServer = this.queryMask(maskElement);
        const maskSprite = maskServer.createMask(node);

        this.renderServers.addChild(maskServer);
        node.mask = maskSprite;
        node.addChild(maskSprite);
      }
    }

    return {
      paint,
    };
  }

  /**
   * Recursively populates a subscene graph that embeds {@code element}. The root of the subscene is returned.
   *
   * @param element - The SVGElement to be embedded.
   * @param options - Inherited attributes from the element's parent, if any.
   * @return The display object that embeds the element for rendering.
   */
  protected populateSceneRecursive(
    element: SVGElement,
    options?: {
      basePaint?: Paint;
    }
  ): Container | undefined {
    const node = this.createNode(element);

    if (!node) {
      return undefined;
    }

    node.on("nodetransformdirty", this.onNodeTransformDirty);

    let paint: Paint | undefined = undefined;

    if (
      element instanceof SVGGraphicsElement ||
      element instanceof SVGMaskElement
    ) {
      const opts = this.embedIntoNode(node, element, options);

      paint = opts.paint as Paint;
    }

    for (let i = 0, j = element.children.length; i < j; i += 1) {
      // eslint-disable-next-line
      // @ts-ignore
      const childNode = this.populateSceneRecursive(element.children[i], {
        basePaint: paint,
      });

      if (childNode) {
        node.addChild(childNode);
      }
    }

    if (node instanceof SVGGraphicsNode) {
      const bbox = node.getLocalBounds(tempRect);
      const { paintServers } = node;
      const { x, y, width: bwidth, height: bheight } = bbox;

      node.paintServers.forEach((paintServer) => {
        paintServer.resolvePaintDimensions(bbox);
      });

      const { geometry } = node;
      const { graphicsData } = geometry;

      if (graphicsData) {
        graphicsData.forEach((data) => {
          const { fillStyle } = data;
          const { lineStyle } = data;

          if (
            fillStyle.texture &&
            paintServers.find(
              (server) => server.paintTexture === fillStyle.texture
            )
          ) {
            const { width } = fillStyle.texture;
            const { height } = fillStyle.texture;

            data.fillStyle.matrix
              .invert()
              .scale(bwidth / width, bheight / height)
              .invert();
          }
          if (fillStyle.matrix) {
            fillStyle.matrix.invert().translate(x, y).invert();
          }

          if (
            lineStyle.texture &&
            paintServers.find(
              (server) => server.paintTexture === lineStyle.texture
            )
          ) {
            const { width } = lineStyle.texture;
            const { height } = lineStyle.texture;

            data.lineStyle.matrix
              .invert()
              .scale(bwidth / width, bheight / height)
              .invert();
          }
          if (lineStyle.matrix) {
            lineStyle.matrix.invert().translate(x, y).invert();
          }
        });

        geometry.updateBatches();
      }
    }

    if (element instanceof SVGMaskElement) {
      // Mask elements are *not* a part of the scene graph.
      return undefined;
    }

    return node;
  }

  /**
   * Populates the entire SVG scene. This should only be called once after the {@link AnimatedGraphic.content} has been set.
   */
  populateScene(): void {
    this.root = this.populateSceneRecursive(this.content);
  }

  /** Stops the AnimatedSVGSprite. */
  public stop(): void {
    if (!this.playing) {
      return;
    }

    this.playing = false;
    if (this._autoUpdate && this._isConnectedToTicker) {
      Ticker.shared.remove(this.update, this);
      this._isConnectedToTicker = false;
    }
  }

  /** Plays the AnimatedSVGSprite. */
  public play(): void {
    if (this.playing) {
      return;
    }

    this.playing = true;
    if (this._autoUpdate && !this._isConnectedToTicker) {
      Ticker.shared.add(this.update, this, UPDATE_PRIORITY.HIGH);
      this._isConnectedToTicker = true;
    }
  }

  /**
   * Stops the AnimatedSVGSprite and goes to a specific time.
   * @param time - time to stop at.
   */
  public gotoAndStop(time: number): void {
    this.stop();
    this._currentTime = time;
    this.updateFrame();
  }

  /**
   * Goes to a specific time and begins playing the AnimatedSVGSprite.
   * @param time - time to start at.
   */
  public gotoAndPlay(time: number): void {
    this._currentTime = time;
    this.updateFrame();
    this.play();
  }

  /**
   * Updates the object transform for rendering.
   */
  update(): void {
    if (this._control?.playing) {
      this._currentTime += this.animationSpeed * Ticker.shared.deltaMS;
      this.updateFrame();
    }
  }

  updateFrame(): number {
    const duration = this._control?.animationDuration || 0;
    const normalizedTime = this._currentTime % duration;
    const currentIteration = Math.floor(this._currentTime / duration);
    const maxFPS = this.maxFPS || Ticker.shared.maxFPS || DEFAULT_MAX_FPS;
    const sampleRate = 1000 / maxFPS;
    let currentFrameIndex = -1;
    let i = 0;
    for (let time = 0; time < duration; time += sampleRate) {
      this._frames[i] = time;
      if (currentFrameIndex < 0) {
        if (time === normalizedTime) {
          currentFrameIndex = i;
        }
        if (time > normalizedTime) {
          currentFrameIndex = i - 1;
        }
      }
      i += 1;
    }
    if (currentFrameIndex < 0) {
      currentFrameIndex = this._frames.length - 1;
    }
    if (this._control) {
      this._control.time = this._frames[currentFrameIndex];
    }

    if (currentFrameIndex !== this._currentFrameIndex) {
      if (currentFrameIndex < this._currentFrameIndex) {
        this.onLoop?.(currentFrameIndex, currentIteration);
      }
      this.onFrameChange?.(currentFrameIndex);
      this._currentFrameIndex = currentFrameIndex;
    }

    return currentFrameIndex;
  }

  /**
   * Stops the AnimatedSVGSprite and destroys it.
   * @param {object|boolean} [options] - Options parameter. A boolean will act as if all options
   *  have been set to that value.
   * @param {boolean} [options.children=false] - If set to true, all the children will have their destroy
   *      method called as well. 'options' will be passed on to those calls.
   * @param {boolean} [options.texture=false] - Should it destroy the current texture of the sprite as well.
   * @param {boolean} [options.baseTexture=false] - Should it destroy the base texture of the sprite as well.
   */
  public destroy(options?: IDestroyOptions | boolean): void {
    this.stop();
    super.destroy(options);

    this.onFrameChange = undefined;
    this.onLoop = undefined;
  }

  /**
   * Handles `nodetransformdirty` events fired by nodes. It will set {@link AnimatedGraphic._transformDirty} to true.
   *
   * This will also emit `transformdirty`.
   */
  private onNodeTransformDirty = (): void => {
    this._transformDirty = true;
    this.emit("transformdirty", this);
  };

  /** Called when the anchor position updates. */
  private onAnchorUpdate(): void {
    this._transformDirty = true;
  }

  /**
   * Load the SVG document and create a {@link AnimatedGraphic} asynchronously.
   *
   * A cache is used for loaded SVG documents.
   *
   * @param url
   * @param context
   * @returns
   */
  static async fromURL(
    url: string,
    options?: AnimatedSVGOptions
  ): Promise<AnimatedGraphic | undefined> {
    const svg = await SVGLoader.instance.load(url);
    if (!svg) {
      return undefined;
    }
    return new AnimatedGraphic(svg, options);
  }

  /**
   * The width at which the SVG scene is being rendered. By default, this is the viewbox width specified by
   * the root element.
   */
  get width(): number {
    return this._width;
  }

  set width(value: number) {
    this._width = value;
    this.scale.x = this._width / this._orig.width;
  }

  /**
   * The height at which the SVG scene is being rendered. By default, this is the viewbox height specified by
   * the root element.
   */
  get height(): number {
    return this._height;
  }

  set height(value: number) {
    this._height = value;
    this.scale.y = this._height / this._orig.height;
  }

  /**
   * The maximum fps that this animation should run at
   * @default 60
   */
  get maxFPS(): number | undefined {
    return this._maxFPS;
  }

  /**
   * The maximum fps that this animation should run at
   * @default 60
   */
  set maxFPS(value: number | undefined) {
    this._maxFPS = value;
  }

  /**
   * The anchor point defines the normalized coordinates
   * in the texture that map to the position of this
   * sprite.
   *
   * By default, this is `(0.5,0.5)`, which means the position
   * `(x,y)` of this `Sprite` will be the center corner.
   *
   * Note: Updating `texture.defaultAnchor` after
   * constructing a `Sprite` does _not_ update its anchor.
   *
   * {@link https://docs.cocos2d-x.org/cocos2d-x/en/sprites/manipulation.html}
   * @default `(0.5,0.5)`
   */
  get anchor(): ObservablePoint {
    return this._anchor;
  }

  /**
   * The total number of frames in the AnimatedSVGSprite. This is the same as number of textures
   * assigned to the AnimatedSVGSprite.
   * @readonly
   * @default 0
   */
  get totalFrames(): number {
    return this._frames.length;
  }

  /**
   * Total animation duration
   */
  get animationDuration(): number {
    return this._control?.animationDuration;
  }

  /**
   * Indicates if the AnimatedSVGSprite is currently playing.
   */
  get playing(): boolean {
    return this._control?.playing || false;
  }

  /**
   * Indicates if the AnimatedSVGSprite is currently playing.
   */
  set playing(value: boolean) {
    if (this._control) {
      this._control.playing = value;
    }
  }

  /** Whether to use PIXI.Ticker.shared to auto update animation time. */
  get autoUpdate(): boolean {
    return this._autoUpdate;
  }

  set autoUpdate(value: boolean) {
    if (value !== this.autoUpdate) {
      this._autoUpdate = value;

      if (!this.autoUpdate && this._isConnectedToTicker) {
        Ticker.shared.remove(this.update, this);
        this._isConnectedToTicker = false;
      } else if (
        this.autoUpdate &&
        !this._isConnectedToTicker &&
        this.playing
      ) {
        Ticker.shared.add(this.update, this);
        this._isConnectedToTicker = true;
      }
    }
  }
}
