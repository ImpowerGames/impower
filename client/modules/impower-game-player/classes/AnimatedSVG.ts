import { Cull } from "@pixi-essentials/cull";
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
import type { Renderer } from "@pixi/core";
import { RenderTexture } from "@pixi/core";
import { Container } from "@pixi/display";
import { Matrix, Rectangle } from "@pixi/math";
import {
  DisplayObject,
  IDestroyOptions,
  ObservablePoint,
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

const DEFAULT_MAX_FPS = 60;

export interface AnimatedSVGOptions {
  maxFPS?: number;
  anchor?: ObservablePoint;
  autoUpdate?: boolean;
  context?: Partial<SVGSceneContext>;
}

/**
 * {@link AnimatedSVG} can be used to build an interactive viewer for scalable vector graphics images.
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
export class AnimatedSVG extends DisplayObject {
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
  public onFrameChange?: (currentFrame: number) => void = null;

  /**
   * User-assigned function to call when `loop` is true, and an AnimatedSVGSprite is played and
   * loops around to start again.
   * @example
   * animation.onLoop = () => {
   *   // looped!
   * };
   */
  public onLoop?: (currentFrame: number, currentIteration: number) => void =
    null;

  /**
   * The SVG image content being rendered by the scene.
   */
  public content: SVGSVGElement;

  /**
   * The root display object of the scene.
   */
  public root: Container;

  /**
   * Display objects that don't render to the screen, but are required to update before the rendering
   * nodes, e.g. mask sprites.
   */
  public renderServers: Container = new Container();

  /**
   * `true` uses PIXI.Ticker.shared to auto update animation time.
   */
  protected _autoUpdate: boolean;

  /**
   * `true` if the instance is currently connected to PIXI.Ticker.shared to auto update animation time.
   */
  protected _isConnectedToTicker = false;

  /** Elapsed time since animation has been started, used internally to display current texture. */
  protected _currentTime = 0;

  /**
   * The scene context
   */
  protected _context: SVGSceneContext;

  /**
   * The width of the rendered scene in local space.
   */
  protected _width: number;

  /**
   * The height of the rendered scene in local space.
   */
  protected _height: number;

  protected _maxFPS: number;

  protected _anchor: ObservablePoint;

  /**
   * This is used to cull the SVG scene graph before rendering.
   */
  protected _cull: Cull = new Cull({ recursive: true, toggle: "renderable" });

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
   * @param content - The SVG node to render
   * @param context - This can be used to configure the scene
   */
  constructor(content: SVGSVGElement, options?: AnimatedSVGOptions) {
    super();

    this.content = content;

    this._maxFPS = options?.maxFPS;
    this._anchor =
      options?.anchor ||
      new ObservablePoint(this.onAnchorUpdate, this, 0.5, 0.5);
    this.initContext(options?.context);

    this._width = content?.viewBox?.baseVal?.width || 0;
    this._height = content?.viewBox?.baseVal?.height || 0;

    if (!options?.context?.disableRootPopulation) {
      this.populateScene();
    }

    this.autoUpdate =
      typeof options?.autoUpdate === "boolean" ? options?.autoUpdate : true;
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

  /**
   * Calculates the bounds of this scene, which is defined by the set `width` and `height`. The contents
   * of this scene are scaled to fit these bounds, and don't affect them whatsoever.
   *
   * @override
   */
  calculateBounds(): void {
    this._bounds.clear();
    this._bounds.addFrameMatrix(
      this.worldTransform,
      0,
      0,
      this.content.viewBox.baseVal.width,
      this.content.viewBox.baseVal.height
    );
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

    // Cull the SVG scene graph
    this._cull.cull(renderer.renderTexture.sourceFrame, true);

    // Render the SVG scene graph
    this.root.render(renderer);

    // Uncull the SVG scene graph. This ensures the scene graph is fully 'renderable'
    // outside of a render cycle.
    this._cull.uncull();
  }

  /**
   * @override
   */
  updateTransform(): void {
    super.updateTransform();

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
      (rootTransform as unknown as { _worldID })._worldID !== 0 &&
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
    this.root.disableTempParent(null);

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
  protected createNode(element: SVGElement): Container {
    let renderNode: Container = null;

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
        renderNode = new SVGGraphicsNode(this._context);
        break;
      case "image":
        renderNode = new SVGImageNode(this._context);
        break;
      case "mask":
      case "svg":
        renderNode = new Container();
        break;
      case "path":
        renderNode = new AnimatedSVGPathNode(
          this._context,
          this._control,
          this.content,
          element as SVGPathElement,
          element.children?.[0] as SVGAnimateElement
        );
        break;
      case "text":
        renderNode = new SVGTextNode();
        break;
      case "use":
        renderNode = new SVGUseNode();
        break;
      default:
        renderNode = null;
        break;
    }

    return renderNode;
  }

  /**
   * Creates a `Paint` object for the given element. This should only be used when sharing the `Paint`
   * is not desired; otherwise, use {@link AnimatedSVG.queryPaint}.
   *
   * This will return `null` if the passed element is not an instance of `SVGElement`.
   *
   * @alpha
   * @param element
   */
  protected createPaint(element: SVGElement): Paint {
    if (!(element instanceof SVGElement)) {
      return null;
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
      });
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
  protected queryPaint(ref: SVGElement): Paint {
    let queryHit = this._elementToPaint.get(ref);

    if (!queryHit) {
      queryHit = this.createPaint(ref);
      this._elementToPaint.set(ref, queryHit);
    }

    return queryHit;
  }

  /**
   * Returns an (uncached) inherited paint of a content element.
   *
   * @alpha
   * @param ref
   */
  protected queryInheritedPaint(ref: SVGElement): Paint {
    const paint = this.queryPaint(ref);
    const parentPaint =
      ref.parentElement &&
      this.queryPaint(ref.parentElement as unknown as SVGElement);

    if (!parentPaint) {
      return paint;
    }

    return new InheritedPaintProvider(parentPaint, paint);
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
    paint: Paint;
  } {
    // Paint
    const { basePaint } = options;
    const paint = basePaint
      ? new InheritedPaintProvider(basePaint, this.queryPaint(element))
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

        if (useTargetURL.startsWith("#")) {
          const useTarget = this.content.querySelector(useTargetURL);
          const contentNode = this.populateSceneRecursive(
            useTarget as SVGGraphicsElement,
            {
              basePaint: usePaint,
            }
          ) as SVGGraphicsNode;

          (node as SVGUseNode).ref = contentNode;
          contentNode.transform.setFromMatrix(Matrix.IDENTITY); // clear transform
        } else if (!this._context.disableHrefSVGLoading) {
          (node as SVGUseNode).isRefExternal = true;

          SVGLoader.instance
            .load(useTargetURL)
            .then(
              (svgDocument) =>
                [
                  new AnimatedSVG(svgDocument, {
                    context: {
                      ...this._context,
                      disableRootPopulation: true,
                    },
                  }),
                  svgDocument.querySelector(`#${useTargetURL.split("#")[1]}`),
                ] as [AnimatedSVG, SVGElement]
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
      const maskElement: SVGMaskElement = this.content.querySelector(
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
  ): Container {
    const node = this.createNode(element);

    if (!node) {
      return null;
    }

    node.on("nodetransformdirty", this.onNodeTransformDirty);

    let paint: Paint;

    if (
      element instanceof SVGGraphicsElement ||
      element instanceof SVGMaskElement
    ) {
      const opts = this.embedIntoNode(node, element, options);

      paint = opts.paint;
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
      return null;
    }

    return node;
  }

  /**
   * Populates the entire SVG scene. This should only be called once after the {@link AnimatedSVG.content} has been set.
   */
  protected populateScene(): void {
    if (this.root) {
      this._cull.remove(this.root);
    }

    const root = this.populateSceneRecursive(this.content);

    this.root = root;
    this._cull.add(this.root);
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
    if (this._control.playing) {
      this._currentTime += this.animationSpeed * Ticker.shared.deltaMS;
      this.updateFrame();
    }
  }

  updateFrame(): number {
    const normalizedTime = this._currentTime % this._control.animationDuration;
    const currentIteration = Math.floor(
      this._currentTime / this._control.animationDuration
    );
    const maxFPS = this.maxFPS || Ticker.shared.maxFPS || DEFAULT_MAX_FPS;
    const sampleRate = 1000 / maxFPS;
    let currentFrameIndex = -1;
    let i = 0;
    for (
      let time = 0;
      time < this._control.animationDuration;
      time += sampleRate
    ) {
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
    this._control.time = this._frames[currentFrameIndex];

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

    this.onFrameChange = null;
    this.onLoop = null;
  }

  /**
   * Handles `nodetransformdirty` events fired by nodes. It will set {@link AnimatedSVG._transformDirty} to true.
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
   * Load the SVG document and create a {@link AnimatedSVG} asynchronously.
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
  ): Promise<AnimatedSVG> {
    return new AnimatedSVG(await SVGLoader.instance.load(url), options);
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
    this.scale.x = this._width / this.content.viewBox.baseVal.width;
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
    this.scale.y = this._height / this.content.viewBox.baseVal.height;
  }

  /**
   * The maximum fps that this animation should run at
   * @default 60
   */
  get maxFPS(): number {
    return this._maxFPS;
  }

  /**
   * The maximum fps that this animation should run at
   * @default 60
   */
  set maxFPS(value: number) {
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
   * Indicates if the AnimatedSVGSprite is currently playing.
   */
  get playing(): boolean {
    return this._control.playing;
  }

  /**
   * Indicates if the AnimatedSVGSprite is currently playing.
   */
  set playing(value: boolean) {
    this._control.playing = value;
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
