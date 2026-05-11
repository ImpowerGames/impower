import { type Schema } from "@impower/spark-engine/src/game/core/types/Schema";
import { randomizeProperties } from "@impower/spark-engine/src/game/core/utils/randomizeProperties";
import { audioBuiltinDefinitions } from "@impower/spark-engine/src/game/modules/audio/audioBuiltinDefinitions";
import { audioRandomDefinitions } from "@impower/spark-engine/src/game/modules/audio/audioRandomDefinitions";
import { audioSchemaDefinitions } from "@impower/spark-engine/src/game/modules/audio/audioSchemaDefinitions";
import { type Synth } from "@impower/spark-engine/src/game/modules/audio/types/Synth";
import { type ComponentChildren, type RenderableProps } from "preact";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { SynthEngine, type Buffers } from "../classes/SynthEngine";
import { SynthVisualizer } from "../classes/SynthVisualizer";
import { ZoomPanHandler, type View } from "../classes/ZoomPanHandler";
import { ICON_COLORS, ICONS } from "./SynthInspector.icons";

// =============================================================================
// CONSTANTS
// =============================================================================

const PIANO_KEYS = [
  { s: -12, b: true },
  { s: -10, b: true },
  { s: -8, b: false },
  { s: -7, b: true },
  { s: -5, b: true },
  { s: -3, b: true },
  { s: -1, b: false },
  { s: 0, b: true, r: true },
  { s: 2, b: true },
  { s: 4, b: false },
  { s: 5, b: true },
  { s: 7, b: true },
  { s: 9, b: true },
  { s: 11, b: false },
  { s: 12, b: false },
];

const DEFAULT_SYNTH: Synth = {
  ...audioBuiltinDefinitions().synth?.$default,
};

const SCHEMA_SYNTH: Schema<Synth> = {
  ...audioSchemaDefinitions().synth.$schema,
};

const RANDOM_SYNTHS: Record<string, any> = audioRandomDefinitions().synth;

// =============================================================================
// SCHEMA HELPERS
// =============================================================================

const options = (schemaRange: string[] | undefined) => {
  return schemaRange!;
};
const step = (
  schemaRange: [number, number, number, ...string[]] | number[] | undefined,
) => {
  return schemaRange?.[0]!;
};
const min = (
  schemaRange: [number, number, number, ...string[]] | number[] | undefined,
) => {
  return schemaRange?.[1]!;
};
const max = (
  schemaRange: [number, number, number, ...string[]] | number[] | undefined,
) => {
  return schemaRange?.[2]!;
};
const decimals = (num: number) => {
  if (Math.floor(num) === num) return 0;
  return num.toString().split(".")[1]?.length || 0;
};

// =============================================================================
// UI COMPONENTS
// =============================================================================

interface IconProps {
  name: keyof typeof ICONS;
  size?: number;
  className?: string;
}

const Icon = ({ name, size = 24, className = "" }: IconProps) => {
  const svgString = ICONS[name] || ICONS.general;
  // Make sure the SVG properly scales with its container
  const cleanSvg = svgString
    .replace(/ width="[0-9]+"/, ' width="100%"')
    .replace(/ height="[0-9]+"/, ' height="100%"');

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: cleanSvg }}
    />
  );
};

interface TopBarProps {
  synth: Synth;
  autoPlay: boolean;
  onChangeAutoPlay: (value: boolean) => void;
}

const TopBar = ({ synth, autoPlay, onChangeAutoPlay }: TopBarProps) => {
  const timeoutRef = useRef(0);
  const intervalRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  const handleClick = useCallback(() => SynthEngine.playSynth(synth), [synth]);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.type === "contextmenu") {
        e.preventDefault();
      }
      clearTimers();
      timeoutRef.current = setTimeout(() => {
        intervalRef.current = setInterval(() => {
          handleClick();
        }, 70);
      }, 300);
    },
    [handleClick],
  );

  return (
    <div className="pt-2 px-3 flex flex-row items-center gap-3">
      <div className="flex items-center space-x-3 w-full justify-between">
        <ToggleButton
          checked={autoPlay}
          onChange={onChangeAutoPlay}
          label="Play On Change"
          title="Toggle Live Play"
        />
      </div>
      <div className="flex items-center space-x-2">
        <button
          onPointerDown={handlePointerDown}
          onPointerUp={clearTimers}
          onClick={handleClick}
          className="cursor-pointer bg-sky-600 hover:bg-sky-500 text-white rounded-sm p-1.5 active:scale-95 flex items-center justify-center space-x-1 px-3 transition-colors shadow-sm"
        >
          <Icon name="play" size={12} />
          <span className="text-xs font-semibold tracking-wide">Play</span>
        </button>
      </div>
    </div>
  );
};

interface MainPreviewProps {
  synth: Synth;
  importedAudio: AudioBuffer | null;
  view: View;
  onViewChange: (view: View) => void;
}

const MainPreview = ({
  synth,
  importedAudio,
  view,
  onViewChange,
}: MainPreviewProps) => {
  const [isReferenceEnabled, setIsReferenceEnabled] = useState(true);

  const containerRectRef = useRef<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomPanHandlerRef = useRef<ZoomPanHandler | null>(null);
  const [visibility, setVisibility] = useState({
    shape: true,
    volume: true,
    pitch: true,
    reference: true,
  });

  const viewRef = useRef(view);
  const timeoutRef = useRef(0);
  const intervalRef = useRef(0);
  const referenceBufferRef = useRef<Float32Array | undefined>(undefined);
  const buffersRef = useRef<Buffers | undefined>(undefined);
  const visibilityRef = useRef(visibility);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  const playReferenceAudio = useCallback(() => {
    if (importedAudio) {
      SynthEngine.playBuffer(importedAudio);
    }
  }, [importedAudio]);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.type === "contextmenu") {
        e.preventDefault();
      }
      clearTimers();
      timeoutRef.current = window.setTimeout(() => {
        intervalRef.current = window.setInterval(() => {
          playReferenceAudio();
        }, 70);
      }, 300);
    },
    [playReferenceAudio, clearTimers],
  );

  const handleResetZoom = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    zoomPanHandlerRef.current?.setView({ start: 0, end: 1 });
  }, []);

  const render = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    containerRectRef.current ??= container.getBoundingClientRect();
    const rect = containerRectRef.current;
    if (!rect) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const view = viewRef.current;
    if (!view) return;
    const buffers = buffersRef.current;
    if (!buffers) return;
    const referenceBuffer = referenceBufferRef.current;
    const visibility = visibilityRef.current;

    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    SynthVisualizer.drawMainGraph(
      ctx,
      rect.width,
      rect.height,
      { ...buffers, referenceBuffer },
      view.start,
      view.end,
      visibility,
    );
  }, []);

  const toggleVisibility = useCallback(
    (key: keyof typeof visibility) => {
      setVisibility((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        visibilityRef.current = next;
        render(); // Trigger a re-render to update the canvas
        return next;
      });
    },
    [render],
  );

  // Sync state view to ref for clean event listener access
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    buffersRef.current = SynthEngine.generateBuffers(synth);
    render();
  }, [synth]);

  useEffect(() => {
    referenceBufferRef.current =
      importedAudio && isReferenceEnabled
        ? importedAudio.getChannelData(0)
        : undefined;
    render();
  }, [importedAudio, isReferenceEnabled]);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    render();
    const observer = new ResizeObserver(() => {
      const container = containerRef.current;
      if (!container) return;
      containerRectRef.current = container.getBoundingClientRect();
      render();
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);

  // Gesture Handling
  useEffect(() => {
    if (!containerRef.current) return;
    zoomPanHandlerRef.current = new ZoomPanHandler(containerRef.current, {
      initial: { start: 0, end: 1 },
      onChange: (newView) => {
        onViewChange(newView);
        viewRef.current = newView;
        render();
      },
    });
    return () => zoomPanHandlerRef.current?.destroy();
  }, [onViewChange, containerRef.current]);

  const isZoomed = view.start > 0 || view.end < 1;

  return (
    <div
      ref={containerRef}
      className={`w-full h-32 relative bg-engine-950 touch-none border-b border-engine-800 ${isZoomed ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      {isZoomed && (
        <button
          onClick={handleResetZoom}
          className="cursor-pointer absolute top-2 left-3 text-[10px] tracking-wide font-mono font-semibold bg-engine-800/80 hover:bg-engine-700 text-sky-400 px-2 py-0.5 rounded-sm border border-engine-700"
        >
          Reset Zoom
        </button>
      )}

      {/* Reference Audio Control Panel */}
      <div className="absolute bottom-2 left-3 flex">
        {importedAudio && (
          <div className="flex bg-engine-900/90 border border-engine-700 rounded-sm px-1.5 py-1 shadow-sm items-center">
            <button
              onClick={() => setIsReferenceEnabled(!isReferenceEnabled)}
              className={`flex items-center justify-center p-1 rounded-sm transition-colors ${
                isReferenceEnabled
                  ? "text-violet-400 bg-violet-400/10 hover:bg-violet-400/20"
                  : "text-engine-500 hover:text-engine-300 hover:bg-engine-800"
              }`}
              title={
                isReferenceEnabled
                  ? "Hide Reference Waveform"
                  : "Show Reference Waveform"
              }
            >
              <Icon name={isReferenceEnabled ? "eye" : "eye-off"} size={14} />
            </button>

            <div className="w-px h-3 bg-engine-700 mx-1.5" />

            <button
              onPointerDown={handlePointerDown}
              onPointerUp={clearTimers}
              onClick={playReferenceAudio}
              className="flex items-center justify-center p-1 rounded-sm text-engine-300 hover:text-white hover:bg-engine-800 transition-colors active:scale-95"
              title="Play Reference Audio"
            >
              <Icon name="play" size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Legend Indicator */}
      <div className="absolute bottom-2 right-3 flex space-x-3 text-[10px] font-mono bg-engine-900/80 px-2 py-1 rounded-sm border border-engine-800/50 select-none">
        <button
          onClick={() => toggleVisibility("shape")}
          className={`cursor-pointer flex items-center uppercase hover:text-white ${
            visibility.shape ? "text-engine-400" : "text-engine-600"
          }`}
        >
          <div
            className={`w-1.5 h-1.5 rounded-sm mr-1.5 ${
              visibility.shape ? "bg-sky-500/80" : "bg-engine-700"
            }`}
          />
          Shape
        </button>
        <button
          onClick={() => toggleVisibility("volume")}
          className={`cursor-pointer flex items-center uppercase hover:text-white ${
            visibility.volume ? "text-engine-400" : "text-engine-600"
          }`}
        >
          <div
            className={`w-1.5 h-1.5 rounded-sm mr-1.5 ${
              visibility.volume ? "bg-amber-500/80" : "bg-engine-700"
            }`}
          />
          Volume
        </button>
        <button
          onClick={() => toggleVisibility("pitch")}
          className={`cursor-pointer flex items-center uppercase hover:text-white ${
            visibility.pitch ? "text-engine-400" : "text-engine-600"
          }`}
        >
          <div
            className={`w-1.5 h-1.5 rounded-sm mr-1.5 ${
              visibility.pitch ? "bg-pink-500/80" : "bg-engine-700"
            }`}
          />
          Pitch
        </button>
      </div>
    </div>
  );
};

interface TabNavigationBarProps {
  active: string;
  onChange: (tab: string) => void;
}

const TabNavigationBar = ({ active, onChange }: TabNavigationBarProps) => {
  return (
    <div className="flex bg-engine-900 h-9 shrink-0">
      {["randomize", "edit", "file"].map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`cursor-pointer flex-1 flex justify-center items-center text-xs font-semibold capitalize tracking-wide transition-colors ${
            active === t
              ? "text-sky-400 border-b-2 border-sky-400 bg-engine-800/30"
              : "text-engine-500 border-b-2 border-transparent hover:text-engine-300 hover:bg-engine-800/20"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
};

interface RandomizePanelProps {
  onRandomize: (synth: Synth) => void;
}

const RandomizePanel = ({ onRandomize }: RandomizePanelProps) => {
  return (
    <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pb-12">
      {Object.entries(RANDOM_SYNTHS).map(([key, randomization]) => {
        const name = key === "$random" ? "random" : key.split(":")[1] || key;
        const color = ICON_COLORS[name as keyof typeof ICON_COLORS];
        return (
          <button
            key={name}
            onClick={() => {
              const randomizedSynth = structuredClone(DEFAULT_SYNTH);
              randomizeProperties(
                randomizedSynth,
                SCHEMA_SYNTH as any,
                randomization,
              );
              SynthEngine.playSynth(randomizedSynth);
              onRandomize(randomizedSynth);
            }}
            className="cursor-pointer w-full bg-engine-900/50 hover:bg-engine-800 border border-engine-800 hover:border-engine-600 rounded-md p-2 flex items-center space-x-2 group text-left transition-all"
          >
            <div
              className={`p-1.5 rounded bg-engine-950 border border-engine-800 group-hover:scale-105 shrink-0 transition-transform ${color}`}
            >
              <Icon name={name as keyof typeof ICONS} size={16} />
            </div>
            <h3 className="text-xs font-semibold text-engine-300 capitalize tracking-wide truncate">
              {name}
            </h3>
          </button>
        );
      })}
    </div>
  );
};

export const DragHandle = ({
  onPointerDown,
}: {
  onPointerDown: (e: PointerEvent) => void;
}) => {
  return (
    <div
      className="cursor-grab active:cursor-grabbing mr-2 bg-engine-900/40 rounded-md p-1.5 text-engine-500 flex items-center justify-center touch-none select-none"
      onPointerDown={onPointerDown}
      title="Drag to reorder"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="12" r="1.5"></circle>
        <circle cx="9" cy="5" r="1.5"></circle>
        <circle cx="9" cy="19" r="1.5"></circle>
        <circle cx="15" cy="12" r="1.5"></circle>
        <circle cx="15" cy="5" r="1.5"></circle>
        <circle cx="15" cy="19" r="1.5"></circle>
      </svg>
    </div>
  );
};

interface DragOverInfo {
  index: number;
  position: "top" | "bottom";
}

interface ModulatorComponentProps {
  synth: Synth;
  defaultSynth: Synth;
  schema: Schema<Synth>;
  onInput: (synth: Synth) => void;
  onChange: (synth: Synth) => void;
  actions?: ComponentChildren;
}

interface DraggableModulatorProps {
  id: string;
  index: number;
  Comp: (props: ModulatorComponentProps) => ComponentChildren;
  synth: Synth;
  defaultSynth: Synth;
  schema: Schema<Synth>;
  onInput: (synth: Synth) => void;
  onChange: (synth: Synth) => void;
  draggedIndex: number | null;
  dragOverInfo: DragOverInfo | null;
  onStartDrag: (index: number, e: PointerEvent) => void;
}

const DraggableModulator = ({
  index,
  Comp,
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
  draggedIndex,
  dragOverInfo,
  onStartDrag,
}: DraggableModulatorProps) => {
  const isDragging = draggedIndex === index;
  const isDragOver = dragOverInfo?.index === index;
  const isDragOverTop = isDragOver && dragOverInfo?.position === "top";
  const isDragOverBottom = isDragOver && dragOverInfo?.position === "bottom";

  return (
    <div
      data-modulator-index={index}
      className={`relative transition-all duration-150 rounded-lg border-2
        ${
          isDragging
            ? "opacity-40 border-dashed border-engine-500 scale-[0.98] pointer-events-none z-0"
            : "border-transparent opacity-100 z-10"
        }
      `}
    >
      {/* Drop Indicator - Top */}
      {isDragOverTop && !isDragging && (
        <div className="absolute -top-2.5 left-0 right-0 h-1 bg-sky-400 rounded-full z-50 pointer-events-none shadow-[0_0_12px_rgba(56,189,248,0.9)] animate-in fade-in duration-100" />
      )}

      {/* Drop Indicator - Bottom */}
      {isDragOverBottom && !isDragging && (
        <div className="absolute -bottom-2.5 left-0 right-0 h-1 bg-sky-400 rounded-full z-50 pointer-events-none shadow-[0_0_12px_rgba(56,189,248,0.9)] animate-in fade-in duration-100" />
      )}

      <Comp
        synth={synth}
        defaultSynth={defaultSynth}
        schema={schema}
        onInput={onInput}
        onChange={onChange}
        actions={<DragHandle onPointerDown={(e) => onStartDrag(index, e)} />}
      />
    </div>
  );
};

interface EditPanelProps {
  synth: Synth;
  defaultSynth: Synth;
  onInput: (synth: Synth) => void;
  onChange: (synth: Synth) => void;
}

const EditPanel = ({
  synth,
  defaultSynth,
  onInput,
  onChange,
}: EditPanelProps) => {
  const schema = SCHEMA_SYNTH;

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<DragOverInfo | null>(null);

  const dragStateRef = useRef({
    draggedIndex: null as number | null,
    dragOverInfo: null as DragOverInfo | null,
  });

  const modulators = [
    { id: "tremolo", order: synth.tremolo.order ?? 0, Comp: TremoloControls },
    { id: "ring", order: synth.ring.order ?? 1, Comp: RingControls },
    { id: "wahwah", order: synth.wahwah.order ?? 2, Comp: WahwahControls },
    {
      id: "bitcrush",
      order: synth.bitcrush.order ?? 3,
      Comp: BitcrushControls,
    },
    { id: "delay", order: synth.delay.order ?? 4, Comp: DelayControls },
  ].sort((a, b) => a.order - b.order);

  const moveModulator = (
    fromIndex: number,
    targetIndex: number,
    position: "top" | "bottom",
  ) => {
    if (fromIndex === targetIndex) return;

    const newMods = [...modulators];
    const [dragged] = newMods.splice(fromIndex, 1);

    let insertIndex = targetIndex;
    if (position === "bottom") insertIndex++;
    if (fromIndex < insertIndex) insertIndex--;

    newMods.splice(insertIndex, 0, dragged);

    let newSynth = synth;
    newMods.forEach((mod, idx) => {
      newSynth = update(newSynth, [mod.id, "order"], idx);
    });
    onInput(newSynth);
    onChange(newSynth);
  };

  const handleStartDrag = useCallback(
    (index: number, e: PointerEvent) => {
      e.preventDefault();
      setDraggedIndex(index);
      dragStateRef.current.draggedIndex = index;

      document.body.style.setProperty("cursor", "grabbing", "important");
      document.body.style.userSelect = "none";

      const handlePointerMove = (ev: PointerEvent) => {
        // Query all draggables instead of just looking at the exact pixel
        const elements = Array.from(
          document.querySelectorAll("[data-modulator-index]"),
        );

        let closestIndex: number | null = null;
        let closestPosition: "top" | "bottom" = "top";
        let minDist = Infinity;

        elements.forEach((el) => {
          const rect = el.getBoundingClientRect();

          // Add a generous horizontal buffer (±100px) so dragging slightly off to the side doesn't instantly lose the indicator
          if (ev.clientX >= rect.left - 100 && ev.clientX <= rect.right + 100) {
            const centerY = rect.top + rect.height / 2;
            // Calculate vertical distance from cursor to the center of the element
            const dist = Math.abs(ev.clientY - centerY);

            if (dist < minDist) {
              minDist = dist;
              closestIndex = parseInt(
                el.getAttribute("data-modulator-index")!,
                10,
              );
              // If above the center line, target top. If below, target bottom.
              closestPosition = ev.clientY < centerY ? "top" : "bottom";
            }
          }
        });

        if (
          closestIndex !== null &&
          closestIndex !== dragStateRef.current.draggedIndex
        ) {
          const currentInfo = dragStateRef.current.dragOverInfo;
          if (
            currentInfo?.index !== closestIndex ||
            currentInfo?.position !== closestPosition
          ) {
            const newInfo: DragOverInfo = {
              index: closestIndex,
              position: closestPosition,
            };
            setDragOverInfo(newInfo);
            dragStateRef.current.dragOverInfo = newInfo;
          }
        } else {
          // Clear only if hovering over the dragged item itself, or far outside the list bounds
          setDragOverInfo(null);
          dragStateRef.current.dragOverInfo = null;
        }
      };

      const handlePointerUp = () => {
        const state = dragStateRef.current;
        if (state.draggedIndex !== null && state.dragOverInfo !== null) {
          moveModulator(
            state.draggedIndex,
            state.dragOverInfo.index,
            state.dragOverInfo.position,
          );
        }

        setDraggedIndex(null);
        setDragOverInfo(null);
        dragStateRef.current = { draggedIndex: null, dragOverInfo: null };

        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [moveModulator],
  );

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 gap-3 items-start pb-12 relative">
      <GeneralControls
        synth={synth}
        defaultSynth={defaultSynth}
        schema={schema}
        onInput={onInput}
        onChange={onChange}
      />
      <EnvelopeControls
        synth={synth}
        defaultSynth={defaultSynth}
        schema={schema}
        onInput={onInput}
        onChange={onChange}
      />
      <PitchControls
        synth={synth}
        defaultSynth={defaultSynth}
        schema={schema}
        onInput={onInput}
        onChange={onChange}
      />
      <DistortionControls
        synth={synth}
        defaultSynth={defaultSynth}
        schema={schema}
        onInput={onInput}
        onChange={onChange}
      />
      <VibratoControls
        synth={synth}
        defaultSynth={defaultSynth}
        schema={schema}
        onInput={onInput}
        onChange={onChange}
      />
      <HarmonicsControls
        synth={synth}
        defaultSynth={defaultSynth}
        schema={schema}
        onInput={onInput}
        onChange={onChange}
      />
      <FMControls
        synth={synth}
        defaultSynth={defaultSynth}
        schema={schema}
        onInput={onInput}
        onChange={onChange}
      />
      <ArpeggioControls
        synth={synth}
        defaultSynth={defaultSynth}
        schema={schema}
        onInput={onInput}
        onChange={onChange}
      />

      {modulators.map(({ id, Comp }, index) => (
        <DraggableModulator
          key={id}
          id={id}
          index={index}
          Comp={Comp}
          synth={synth}
          defaultSynth={defaultSynth}
          schema={schema}
          onInput={onInput}
          onChange={onChange}
          draggedIndex={draggedIndex}
          dragOverInfo={dragOverInfo}
          onStartDrag={handleStartDrag}
        />
      ))}

      <ReverbControls
        synth={synth}
        defaultSynth={defaultSynth}
        schema={schema}
        onInput={onInput}
        onChange={onChange}
      />
      <HighpassControls
        synth={synth}
        defaultSynth={defaultSynth}
        schema={schema}
        onInput={onInput}
        onChange={onChange}
      />
      <LowpassControls
        synth={synth}
        defaultSynth={defaultSynth}
        schema={schema}
        onInput={onInput}
        onChange={onChange}
      />
    </div>
  );
};

interface PreviewCanvasProps<T = any> {
  draw: (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    params: T,
  ) => void;
  colorType: "default" | "pitch" | "volume";
  label?: string;
  classes?: string;
  sampleRate: number;
  params: T;
}

const PreviewCanvas = ({
  draw,
  colorType,
  label = "Preview",
  classes = "",
  params,
  sampleRate,
}: PreviewCanvasProps) => {
  const containerRectRef = useRef<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorClass =
    colorType === "pitch"
      ? "text-pink-500/50"
      : colorType === "volume"
        ? "text-amber-500/50"
        : "text-sky-500/50";
  const color =
    colorType === "pitch"
      ? "#ec4899"
      : colorType === "volume"
        ? "#f59e0b"
        : "#0ea5e9";

  const render = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    containerRectRef.current ??= container.getBoundingClientRect();
    const rect = containerRectRef.current;
    if (!rect) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    draw(ctx, rect.width, rect.height, color, {
      ...params,
      sampleRate,
    });
  }, [draw, color, sampleRate, params]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    render();
    const observer = new ResizeObserver(() => {
      const container = containerRef.current;
      if (!container) return;
      containerRectRef.current ??= container.getBoundingClientRect();
      render();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [render]);

  return (
    <div className={`flex flex-col relative p-3 flex-1 min-h-30 ${classes}`}>
      <div
        className={`absolute top-2 left-3 text-[10px] tracking-wide font-mono font-semibold ${colorClass}`}
      >
        {label}
      </div>
      <div
        ref={containerRef}
        className="relative flex-1 w-full mt-4 flex items-center justify-center"
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>
    </div>
  );
};

interface SliderProps {
  label: string;
  value: number;
  defaultValue?: number;
  displayMultiplier?: number;
  min: number;
  max: number;
  step: number;
  onInput: (val: number) => void;
  onChange: (val: number) => void;
  unit?: string;
  colorType?: "default" | "pitch" | "volume";
}

const Slider = ({
  label,
  value,
  defaultValue,
  displayMultiplier = 1,
  min,
  max,
  step,
  onInput,
  onChange,
  unit = "",
  colorType = "default",
}: SliderProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [displayedValue, setDisplayedValue] = useState<number>(
    (value || 0) * displayMultiplier,
  );

  useEffect(() => {
    const v = Number(value || 0) * displayMultiplier;
    setDisplayedValue(v);
  }, [value]);

  const handleReset = useCallback(() => {
    if (defaultValue !== undefined) {
      const v = Number(defaultValue);
      setDisplayedValue(v * displayMultiplier);
      onInput(v);
      onChange(v);
    }
  }, [defaultValue, step, onInput, onChange]);

  const displayedMin = min * displayMultiplier;
  const displayedMax = max * displayMultiplier;
  const displayedStep = step * displayMultiplier;

  const perc =
    Math.max(
      0,
      Math.min(
        100,
        ((displayedValue - displayedMin) / (displayedMax - displayedMin)) * 100,
      ),
    ) || 0;

  const color =
    colorType === "pitch"
      ? "#ec4899"
      : colorType === "volume"
        ? "#f59e0b"
        : "#0ea5e9";

  const handleTextChange = useCallback(
    (e: Event) => {
      const v = parseFloat((e.currentTarget as HTMLInputElement).value);
      if (!isNaN(v)) {
        setDisplayedValue(v);
        onInput(v / displayMultiplier);
      }
    },
    [step, onInput],
  );

  const handleTextFocus = useCallback(() => {
    inputRef.current?.select();
  }, []);

  const handleTextBlur = useCallback(() => {
    const inputValue = parseFloat(inputRef.current?.value ?? "");
    if (!isNaN(inputValue)) {
      setDisplayedValue(inputValue);
      if (inputValue !== displayedValue) {
        onChange(inputValue / displayMultiplier);
      }
    } else {
      setDisplayedValue(value * displayMultiplier);
    }
  }, [displayedValue, value, step, onChange]);

  // Determine if the current value has been altered from the default
  const isModified =
    defaultValue !== undefined &&
    Math.abs(displayedValue / displayMultiplier - defaultValue) >
      Number.EPSILON;

  const textInputDisplayedValue =
    displayedValue === 0
      ? "0"
      : displayMultiplier === 1
        ? displayedValue.toFixed(step < 1 ? decimals(step) : 0)
        : Math.round(displayedValue);

  return (
    <div className="flex flex-col space-y-1.5">
      <div className="flex justify-between items-center text-xs text-engine-400">
        <div className="flex items-center space-x-2 h-4">
          <span>{label}</span>
        </div>
        <div className="flex justify-end items-center space-x-2">
          {isModified && (
            <ResetButton
              onClick={handleReset}
              title={`Reset to default (${defaultValue})`}
            >
              Reset
            </ResetButton>
          )}
          <div className="flex items-end space-x-1 bg-engine-950/50 border border-engine-800 rounded-sm px-1.5 py-0.5">
            <input
              type="text"
              ref={inputRef}
              value={textInputDisplayedValue}
              onChange={handleTextChange}
              onFocus={handleTextFocus}
              onBlur={handleTextBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              className="font-mono bg-transparent text-right text-engine-200 tabular-nums min-w-[2ch] outline-none"
              style={{
                width: `${Math.max(1, String(textInputDisplayedValue).length + 0.5)}ch`,
              }}
            />
            <span className="font-mono text-engine-500 tabular-nums text-[10px]">
              {unit}
            </span>
          </div>
        </div>
      </div>
      <input
        type="range"
        min={displayedMin}
        max={displayedMax}
        step={displayedStep}
        value={displayedValue}
        onInput={(e) => {
          const sliderValue = parseFloat(
            (e.currentTarget as HTMLInputElement).value,
          );
          setDisplayedValue(sliderValue);
          onInput(sliderValue / displayMultiplier);
        }}
        onChange={(e) => {
          const sliderValue = parseFloat(
            (e.currentTarget as HTMLInputElement).value,
          );
          setDisplayedValue(sliderValue);
          onChange(sliderValue / displayMultiplier);
        }}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-sm bg-transparent [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:bg-engine-200 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-engine-200"
        style={{
          background: `linear-gradient(to right, ${color} ${perc}%, #334155 ${perc}%)`,
        }}
      />
    </div>
  );
};

interface SelectProps {
  label: string;
  value: string;
  defaultValue: string;
  options: string[];
  onChange: (val: any) => void;
}

const Select = ({
  label,
  value,
  defaultValue,
  options,
  onChange,
}: SelectProps) => {
  const handleReset = useCallback(() => {
    if (defaultValue !== undefined) {
      onChange(defaultValue);
    }
  }, [defaultValue, onChange]);

  // Determine if the current value has been altered from the default
  const isModified = defaultValue !== undefined && value !== defaultValue;

  return (
    <div className="flex flex-col space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-engine-400">{label}</span>
        {isModified && (
          <button
            onClick={handleReset}
            className="text-[9px] font-bold text-engine-500 hover:text-sky-400 active:text-sky-300 uppercase tracking-wide bg-engine-800/40 hover:bg-engine-800 px-1 rounded-sm cursor-pointer transition-colors"
            title={`Reset to default (${defaultValue})`}
          >
            Reset
          </button>
        )}
      </div>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
          className="bg-engine-950/80 text-xs text-engine-200 rounded-sm py-1.5 pl-2 pr-7 outline-none border border-engine-800 focus:border-sky-500 w-full appearance-none cursor-pointer"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </option>
          ))}
        </select>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-engine-500">
          <Icon name="chevronDown" size={12} />
        </div>
      </div>
    </div>
  );
};

interface ToggleProps {
  isOnClasses?: string;
  isOffClasses?: string;
  value?: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

const Toggle = ({
  isOnClasses = "",
  isOffClasses = "bg-engine-800",
  value,
  disabled,
  onChange,
}: ToggleProps) => {
  const [localValue, setLocalValue] = useState(value ?? false);
  const handleClick = () => {
    const newValue = !localValue;
    onChange(newValue);
    setLocalValue(localValue);
  };
  return (
    <button
      onClick={handleClick}
      className={`
          relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-full border border-black/20
          ${value ? isOnClasses : isOffClasses + " group-hover:bg-engine-900"}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        `}
    >
      <span
        className={`
            inline-block h-2.75 w-2.75 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out
            ${value ? "translate-x-4" : "translate-x-0.5"}
          `}
      />
    </button>
  );
};

export interface ToggleButtonProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ComponentChildren;
  title?: string;
  disabled?: boolean;
}

export const ToggleButton = ({
  checked,
  onChange,
  label,
  title,
  disabled = false,
}: ToggleButtonProps) => {
  return (
    <button
      className={`
        group flex items-center space-x-2 p-1 pl-1.5 pr-2.5 rounded-sm border
        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        ${
          checked
            ? "bg-sky-900/20 border-sky-800/50 text-sky-400"
            : "bg-engine-800/50 border-engine-700 text-engine-400 hover:text-engine-200 hover:border-engine-500 hover:bg-engine-800"
        }
      `}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      title={title}
    >
      <div
        className={`
          relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full border border-black/20
          ${checked ? "bg-sky-600" : "bg-engine-950 group-hover:bg-engine-900"}
        `}
      >
        <span
          className={`
            inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out
            ${checked ? "translate-x-2.75" : "translate-x-0.5"}
          `}
        />
      </div>

      {label && (
        <span className="text-[10px] text-nowrap font-semibold tracking-wide select-none">
          {label}
        </span>
      )}
    </button>
  );
};

export interface ResetButtonProps {
  onClick: () => void;
  children?: ComponentChildren;
  title?: string;
}

export const ResetButton = ({ onClick, children, title }: ResetButtonProps) => {
  return (
    <button
      onClick={onClick}
      className="text-[9px] font-bold text-engine-500 hover:text-sky-400 active:text-sky-300 uppercase tracking-wide bg-engine-800/40 hover:bg-engine-800 px-2 py-0.5 rounded-sm cursor-pointer transition-colors"
      title={title}
    >
      {children}
    </button>
  );
};

interface ControlSectionProps<T = any> {
  title: string;
  iconName: keyof typeof ICONS;
  preview?: ComponentChildren;
  children: ComponentChildren;
  toggleable?: boolean;
  isOn?: boolean;
  value: T;
  defaultValue: T;
  onToggle?: () => void;
  onReset?: (value: T) => void;
  colorType?: "default" | "pitch" | "volume";
  actions?: ComponentChildren;
}

export interface FunctionComponent<P = {}> {
  (props: RenderableProps<P>, context?: any): ComponentChildren;
  displayName?: string;
  defaultProps?: Partial<P> | undefined;
}

const ControlSection = ({
  title,
  iconName,
  preview,
  children,
  toggleable = false,
  isOn,
  value,
  defaultValue,
  onToggle,
  onReset,
  colorType = "default",
  actions,
}: ControlSectionProps) => {
  const isExpanded = !toggleable || isOn;

  const defaultValueClone = structuredClone(defaultValue);
  delete defaultValueClone.order;
  const valueClone = structuredClone(value);
  delete valueClone.order;

  const isModified =
    defaultValue !== undefined &&
    JSON.stringify(defaultValueClone) !== JSON.stringify(valueClone);

  const accent =
    colorType === "pitch"
      ? "text-pink-400"
      : colorType === "volume"
        ? "text-amber-400"
        : "text-sky-400";
  const bg =
    colorType === "pitch"
      ? "bg-pink-600"
      : colorType === "volume"
        ? "bg-amber-600"
        : "bg-sky-600";

  return (
    <div
      className={`w-full rounded-md overflow-hidden border transition-all duration-200 ${isExpanded ? "bg-engine-900 border-engine-700/50 shadow-sm" : "bg-engine-900/40 border-engine-800/80"}`}
    >
      <div
        className={`p-1 px-3 min-h-9 flex items-center justify-between ${isExpanded ? "bg-engine-800/30 border-b border-engine-800/80" : "bg-transparent"}`}
      >
        <div
          className={`flex items-center space-x-2 font-medium text-xs ${isExpanded ? "text-engine-200" : "text-engine-500"}`}
        >
          <Icon
            name={iconName}
            size={16}
            className={`${isExpanded ? accent : "text-engine-600"}`}
          />
          <span>{title}</span>
        </div>
        <div className="flex items-center space-x-2">
          {isModified && (
            <ResetButton
              onClick={() => {
                onReset?.(defaultValue);
              }}
              title={`Reset all to default`}
            >
              Reset All
            </ResetButton>
          )}
          {actions}
          {toggleable && onToggle && (
            <Toggle isOnClasses={bg} value={isOn} onChange={onToggle} />
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="flex flex-col">
          <div className="flex flex-col lg:flex-row">
            <div className="flex-1 p-3 space-y-4">{children}</div>
            <div className="flex flex-col w-full md:w-2/5 border-t md:border-t-0 md:border-l border-engine-800 bg-engine-950/30 md:min-h-full">
              {preview}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function update<T extends object>(
  obj: T,
  path: string | (string | number)[],
  value: any,
): T {
  const parts =
    typeof path === "string" ? path.split(".").filter((p) => p) : path;
  if (parts.length === 0) return value;
  const next = Array.isArray(obj) ? [...obj] : { ...obj };
  let current = next as any;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    current[key] = Array.isArray(current[key])
      ? [...current[key]]
      : { ...current[key] };
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
  return next as T;
}

interface ControlProps {
  synth: Synth;
  defaultSynth: Synth;
  schema: Schema<Synth>;
  onInput: (synth: Synth) => void;
  onChange: (synth: Synth) => void;
  actions?: ComponentChildren;
}

const GeneralControls = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
}: ControlProps) => {
  const sampleRate = SynthEngine.sampleRate;
  const value = useMemo(
    () => ({ shape: synth.shape, volume: synth.volume }),
    [synth.shape, synth.volume],
  );
  const defaultValue = useMemo(
    () => ({ shape: defaultSynth.shape, volume: defaultSynth.volume }),
    [defaultSynth.shape, defaultSynth.volume],
  );
  return (
    <ControlSection
      title="General"
      iconName="general"
      value={value}
      defaultValue={defaultValue}
      onReset={(defaultValue) => {
        const newSynth = update(
          update(synth, ["shape"], defaultValue.shape),
          ["volume"],
          defaultSynth.volume,
        );
        onInput(newSynth);
        onChange(newSynth);
      }}
      preview={
        <PreviewCanvas
          draw={SynthVisualizer.drawShape}
          colorType="default"
          label="Shape"
          params={value}
          sampleRate={sampleRate}
        />
      }
    >
      <Select
        label="Shape"
        options={options(schema.shape)}
        value={synth.shape}
        defaultValue={defaultSynth.shape}
        onChange={(v) => {
          const newSynth = update(synth, ["shape"], v);
          onInput(newSynth);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Volume"
        unit="p"
        colorType="volume"
        min={min(schema.volume)}
        max={max(schema.volume)}
        step={step(schema.volume)}
        value={synth.volume}
        defaultValue={defaultSynth.volume}
        onInput={(v) => {
          const newSynth = update(synth, ["volume"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["volume"], v);
          onChange(newSynth);
        }}
      />
    </ControlSection>
  );
};

const EnvelopeControls = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
}: ControlProps) => {
  const sampleRate = SynthEngine.sampleRate;
  return (
    <ControlSection
      title="Envelope"
      iconName="envelope"
      colorType="volume"
      value={synth.envelope}
      defaultValue={defaultSynth.envelope}
      onReset={(defaultValue) => {
        const newSynth = update(synth, ["envelope"], defaultValue);
        onInput(newSynth);
        onChange(newSynth);
      }}
      preview={
        <PreviewCanvas
          draw={SynthVisualizer.drawEnvelope}
          colorType="volume"
          label="Volume"
          params={synth.envelope}
          sampleRate={sampleRate}
        />
      }
    >
      <Slider
        label="Offset"
        unit="s"
        colorType="volume"
        min={min(schema.envelope?.offset)}
        max={max(schema.envelope?.offset)}
        step={step(schema.envelope?.offset)}
        value={synth.envelope.offset}
        defaultValue={defaultSynth.envelope.offset}
        onInput={(v) => {
          const newSynth = update(synth, ["envelope", "offset"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["envelope", "offset"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Attack"
        unit="s"
        colorType="volume"
        min={min(schema.envelope?.attack)}
        max={max(schema.envelope?.attack)}
        step={step(schema.envelope?.attack)}
        value={synth.envelope.attack}
        defaultValue={defaultSynth.envelope.attack}
        onInput={(v) => {
          const newSynth = update(synth, ["envelope", "attack"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["envelope", "attack"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Decay"
        unit="s"
        colorType="volume"
        min={min(schema.envelope?.decay)}
        max={max(schema.envelope?.decay)}
        step={step(schema.envelope?.decay)}
        value={synth.envelope.decay}
        defaultValue={defaultSynth.envelope.decay}
        onInput={(v) => {
          const newSynth = update(synth, ["envelope", "decay"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["envelope", "decay"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Sustain"
        unit="s"
        colorType="volume"
        min={min(schema.envelope?.sustain)}
        max={max(schema.envelope?.sustain)}
        step={step(schema.envelope?.sustain)}
        value={synth.envelope.sustain}
        defaultValue={defaultSynth.envelope.sustain}
        onInput={(v) => {
          const newSynth = update(synth, ["envelope", "sustain"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["envelope", "sustain"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Release"
        unit="s"
        colorType="volume"
        min={min(schema.envelope?.release)}
        max={max(schema.envelope?.release)}
        step={step(schema.envelope?.release)}
        value={synth.envelope.release}
        defaultValue={defaultSynth.envelope.release}
        onInput={(v) => {
          const newSynth = update(synth, ["envelope", "release"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["envelope", "release"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Level"
        unit="p"
        colorType="volume"
        min={min(schema.envelope?.level)}
        max={max(schema.envelope?.level)}
        step={step(schema.envelope?.level)}
        value={synth.envelope.level}
        defaultValue={defaultSynth.envelope.level}
        onInput={(v) => {
          const newSynth = update(synth, ["envelope", "level"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["envelope", "level"], v);
          onChange(newSynth);
        }}
      />
    </ControlSection>
  );
};

const PitchControls = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
}: ControlProps) => {
  const [activeKey, setActiveKey] = useState("");

  const sampleRate = SynthEngine.sampleRate;

  const pressPianoWhiteKey = (k: { s: number; b: boolean; r?: boolean }) => {
    const v = 440 * Math.pow(2, (k.s - 9) / 12);
    setActiveKey(() => `w-${k.s}`);
    const newSynth = update(synth, ["pitch", "frequency"], v);
    onChange(newSynth);
  };
  const liftKey = () => {
    setActiveKey(() => ``);
  };
  const pressPianoBlackKey = (k: { s: number; b: boolean; r?: boolean }) => {
    const v = 440 * Math.pow(2, (k.s + 1 - 9) / 12);
    setActiveKey(() => `b-${k.s}`);
    const newSynth = update(synth, ["pitch", "frequency"], v);
    onChange(newSynth);
  };

  return (
    <ControlSection
      title="Pitch"
      iconName="pitch"
      colorType="pitch"
      value={synth.pitch}
      defaultValue={defaultSynth.pitch}
      onReset={(defaultValue) => {
        const newSynth = update(synth, ["pitch"], defaultValue);
        onInput(newSynth);
        onChange(newSynth);
      }}
      preview={
        <PreviewCanvas
          draw={SynthVisualizer.drawPitch}
          colorType="pitch"
          label="Pitch"
          params={synth.pitch}
          sampleRate={sampleRate}
        />
      }
    >
      <div className="mb-4">
        <div className="flex h-16 w-full rounded-sm overflow-hidden border border-engine-800 relative bg-engine-950">
          {PIANO_KEYS.map((k) => (
            <div
              key={`w-${k.s}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                pressPianoWhiteKey(k);
              }}
              onPointerEnter={(e) => {
                if (e.buttons > 0) {
                  e.stopPropagation();
                  pressPianoWhiteKey(k);
                }
              }}
              onPointerUp={liftKey}
              onPointerLeave={liftKey}
              onPointerCancel={liftKey}
              className={`relative flex-1 border-r border-neutral-800 last:border-0 cursor-pointer transition-colors duration-75
                ${activeKey === `w-${k.s}` ? "bg-neutral-300" : "bg-neutral-200 hover:bg-white"}
              `}
            >
              {k.r && (
                <div className="absolute bottom-1 w-full text-center text-[9px] text-neutral-500 font-bold">
                  C4
                </div>
              )}
            </div>
          ))}
          {PIANO_KEYS.map((k, i) =>
            k.b ? (
              <div
                key={`b-${k.s}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  pressPianoBlackKey(k);
                }}
                onPointerEnter={(e) => {
                  if (e.buttons > 0) {
                    e.stopPropagation();
                    pressPianoBlackKey(k);
                  }
                }}
                onPointerUp={liftKey}
                onPointerLeave={liftKey}
                onPointerCancel={liftKey}
                className={`absolute top-0 h-[60%] z-10 rounded-b-sm border-x border-b border-neutral-950 cursor-pointer transition-colors duration-75
                  ${activeKey === `b-${k.s}` ? "bg-black" : "bg-neutral-800 hover:bg-neutral-700"}
                `}
                style={{
                  left: `calc(${(i + 1) * (100 / PIANO_KEYS.length)}%)`,
                  width: `calc(${100 / PIANO_KEYS.length}% * 0.65)`,
                  transform: "translateX(-50%)",
                }}
              />
            ) : null,
          )}
        </div>
      </div>
      <Slider
        label="Frequency"
        unit="Hz"
        colorType="pitch"
        min={min(schema.pitch?.frequency)}
        max={max(schema.pitch?.frequency)}
        step={step(schema.pitch?.frequency)}
        value={synth.pitch.frequency}
        defaultValue={defaultSynth.pitch.frequency}
        onInput={(v) => {
          const newSynth = update(synth, ["pitch", "frequency"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["pitch", "frequency"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Ramp"
        unit="st/s "
        colorType="pitch"
        displayMultiplier={SynthEngine.pitchSemitonesMultiplier}
        min={min(schema.pitch?.frequency_ramp)}
        max={max(schema.pitch?.frequency_ramp)}
        step={step(schema.pitch?.frequency_ramp)}
        value={synth.pitch.frequency_ramp}
        defaultValue={defaultSynth.pitch.frequency_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["pitch", "frequency_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["pitch", "frequency_ramp"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Torque"
        unit="st/s²"
        colorType="pitch"
        displayMultiplier={SynthEngine.pitchSemitonesMultiplier}
        min={min(schema.pitch?.frequency_torque)}
        max={max(schema.pitch?.frequency_torque)}
        step={step(schema.pitch?.frequency_torque)}
        value={synth.pitch.frequency_torque}
        defaultValue={defaultSynth.pitch.frequency_torque}
        onInput={(v) => {
          const newSynth = update(synth, ["pitch", "frequency_torque"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["pitch", "frequency_torque"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Jerk"
        unit="st/s³"
        colorType="pitch"
        displayMultiplier={SynthEngine.pitchSemitonesMultiplier}
        min={min(schema.pitch?.frequency_jerk)}
        max={max(schema.pitch?.frequency_jerk)}
        step={step(schema.pitch?.frequency_jerk)}
        value={synth.pitch.frequency_jerk}
        defaultValue={defaultSynth.pitch.frequency_jerk}
        onInput={(v) => {
          const newSynth = update(synth, ["pitch", "frequency_jerk"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["pitch", "frequency_jerk"], v);
          onChange(newSynth);
        }}
      />
    </ControlSection>
  );
};

const HarmonicsControls = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
}: ControlProps) => {
  const sampleRate = SynthEngine.sampleRate;
  return (
    <ControlSection
      title="Harmonics"
      iconName="harmonics"
      toggleable
      isOn={synth.harmonics.on}
      value={synth.harmonics}
      defaultValue={defaultSynth.harmonics}
      onReset={(defaultValue) => {
        const newSynth = update(synth, ["harmonics"], defaultValue);
        onInput(newSynth);
        onChange(newSynth);
      }}
      onToggle={() => {
        const v = !synth.harmonics.on;
        const newSynth = update(synth, ["harmonics", "on"], v);
        onInput(newSynth);
        onChange(newSynth);
      }}
      colorType="pitch"
      preview={
        <PreviewCanvas
          draw={SynthVisualizer.drawHarmonics}
          colorType="pitch"
          label="Harmonies"
          params={synth.harmonics}
          sampleRate={sampleRate}
        />
      }
    >
      <Slider
        label="Count"
        unit="h"
        colorType="pitch"
        min={min(schema.harmonics?.count)}
        max={max(schema.harmonics?.count)}
        step={step(schema.harmonics?.count)}
        value={synth.harmonics.count}
        defaultValue={defaultSynth.harmonics.count}
        onInput={(v) => {
          const newSynth = update(synth, ["harmonics", "count"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["harmonics", "count"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Count Ramp"
        unit="h/s"
        colorType="pitch"
        min={min(schema.harmonics?.count_ramp)}
        max={max(schema.harmonics?.count_ramp)}
        step={step(schema.harmonics?.count_ramp)}
        value={synth.harmonics.count_ramp}
        defaultValue={defaultSynth.harmonics.count_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["harmonics", "count_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["harmonics", "count_ramp"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Falloff"
        unit="p"
        colorType="pitch"
        min={min(schema.harmonics?.falloff)}
        max={max(schema.harmonics?.falloff)}
        step={step(schema.harmonics?.falloff)}
        value={synth.harmonics.falloff}
        defaultValue={defaultSynth.harmonics.falloff}
        onInput={(v) => {
          const newSynth = update(synth, ["harmonics", "falloff"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["harmonics", "falloff"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Falloff Ramp"
        unit="p/s"
        colorType="pitch"
        min={min(schema.harmonics?.falloff_ramp)}
        max={max(schema.harmonics?.falloff_ramp)}
        step={step(schema.harmonics?.falloff_ramp)}
        value={synth.harmonics.falloff_ramp}
        defaultValue={defaultSynth.harmonics.falloff_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["harmonics", "falloff_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["harmonics", "falloff_ramp"], v);
          onChange(newSynth);
        }}
      />
    </ControlSection>
  );
};

const FMControls = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
}: ControlProps) => {
  const sampleRate = SynthEngine.sampleRate;
  return (
    <ControlSection
      title="FM"
      iconName="fm"
      toggleable
      isOn={synth.fm.on}
      value={synth.fm}
      defaultValue={defaultSynth.fm}
      onReset={(defaultValue) => {
        const newSynth = update(synth, ["fm"], defaultValue);
        onInput(newSynth);
        onChange(newSynth);
      }}
      onToggle={() => {
        const v = !synth.fm.on;
        const newSynth = update(synth, ["fm", "on"], v);
        onInput(newSynth);
        onChange(newSynth);
      }}
      preview={
        <PreviewCanvas
          draw={SynthVisualizer.drawFM}
          colorType="default"
          label="Shape"
          params={synth.fm}
          sampleRate={sampleRate}
        />
      }
    >
      <Slider
        label="Ratio"
        unit="p"
        min={min(schema.fm?.ratio)}
        max={max(schema.fm?.ratio)}
        step={step(schema.fm?.ratio)}
        value={synth.fm.ratio}
        defaultValue={defaultSynth.fm.ratio}
        onInput={(v) => {
          const newSynth = update(synth, ["fm", "ratio"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["fm", "ratio"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Ratio Ramp"
        unit="p/s"
        min={min(schema.fm?.ratio_ramp)}
        max={max(schema.fm?.ratio_ramp)}
        step={step(schema.fm?.ratio_ramp)}
        value={synth.fm.ratio_ramp}
        defaultValue={defaultSynth.fm.ratio_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["fm", "ratio_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["fm", "ratio_ramp"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Strength"
        unit="p"
        min={min(schema.fm?.strength)}
        max={max(schema.fm?.strength)}
        step={step(schema.fm?.strength)}
        value={synth.fm.strength}
        defaultValue={defaultSynth.fm.strength}
        onInput={(v) => {
          const newSynth = update(synth, ["fm", "strength"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["fm", "strength"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Strength Ramp"
        unit="p/s"
        min={min(schema.fm?.strength_ramp)}
        max={max(schema.fm?.strength_ramp)}
        step={step(schema.fm?.strength_ramp)}
        value={synth.fm.strength_ramp}
        defaultValue={defaultSynth.fm.strength_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["fm", "strength_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["fm", "strength_ramp"], v);
          onChange(newSynth);
        }}
      />
    </ControlSection>
  );
};

const HighpassControls = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
}: ControlProps) => {
  const sampleRate = SynthEngine.sampleRate;
  return (
    <ControlSection
      title="Highpass"
      iconName="highpass"
      toggleable
      isOn={synth.highpass.on}
      value={synth.highpass}
      defaultValue={defaultSynth.highpass}
      onReset={(defaultValue) => {
        const newSynth = update(synth, ["highpass"], defaultValue);
        onInput(newSynth);
        onChange(newSynth);
      }}
      onToggle={() => {
        const v = !synth.highpass.on;
        const newSynth = update(synth, ["highpass", "on"], v);
        onInput(newSynth);
        onChange(newSynth);
      }}
      colorType="pitch"
      preview={
        <PreviewCanvas
          draw={SynthVisualizer.drawHighpassFilter}
          colorType="pitch"
          label="Frequencies"
          params={synth.highpass}
          sampleRate={sampleRate}
        />
      }
    >
      <Slider
        label="Cutoff"
        unit="Hz"
        colorType="pitch"
        min={min(schema.highpass?.cutoff)}
        max={max(schema.highpass?.cutoff)}
        step={step(schema.highpass?.cutoff)}
        value={synth.highpass.cutoff}
        defaultValue={defaultSynth.highpass.cutoff}
        onInput={(v) => {
          const newSynth = update(synth, ["highpass", "cutoff"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["highpass", "cutoff"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Cutoff Ramp"
        unit="st/s"
        colorType="pitch"
        displayMultiplier={SynthEngine.pitchSemitonesMultiplier}
        min={min(schema.highpass?.cutoff_ramp)}
        max={max(schema.highpass?.cutoff_ramp)}
        step={step(schema.highpass?.cutoff_ramp)}
        value={synth.highpass.cutoff_ramp}
        defaultValue={defaultSynth.highpass.cutoff_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["highpass", "cutoff_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["highpass", "cutoff_ramp"], v);
          onChange(newSynth);
        }}
      />
    </ControlSection>
  );
};

const LowpassControls = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
}: ControlProps) => {
  const sampleRate = SynthEngine.sampleRate;
  return (
    <ControlSection
      title="Lowpass"
      iconName="lowpass"
      toggleable
      isOn={synth.lowpass.on}
      value={synth.lowpass}
      defaultValue={defaultSynth.lowpass}
      onReset={(defaultValue) => {
        const newSynth = update(synth, ["lowpass"], defaultValue);
        onInput(newSynth);
        onChange(newSynth);
      }}
      onToggle={() => {
        const v = !synth.lowpass.on;
        const newSynth = update(synth, ["lowpass", "on"], v);
        onInput(newSynth);
        onChange(newSynth);
      }}
      colorType="pitch"
      preview={
        <PreviewCanvas
          draw={SynthVisualizer.drawLowpassFilter}
          colorType="pitch"
          label="Frequencies"
          params={synth.lowpass}
          sampleRate={sampleRate}
        />
      }
    >
      <Slider
        label="Cutoff"
        unit="Hz"
        colorType="pitch"
        min={min(schema.lowpass?.cutoff)}
        max={max(schema.lowpass?.cutoff)}
        step={step(schema.lowpass?.cutoff)}
        value={synth.lowpass.cutoff}
        defaultValue={defaultSynth.lowpass.cutoff}
        onInput={(v) => {
          const newSynth = update(synth, ["lowpass", "cutoff"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["lowpass", "cutoff"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Cutoff Ramp"
        unit="st/s"
        colorType="pitch"
        displayMultiplier={SynthEngine.pitchSemitonesMultiplier}
        min={min(schema.lowpass?.cutoff_ramp)}
        max={max(schema.lowpass?.cutoff_ramp)}
        step={step(schema.lowpass?.cutoff_ramp)}
        value={synth.lowpass.cutoff_ramp}
        defaultValue={defaultSynth.lowpass.cutoff_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["lowpass", "cutoff_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["lowpass", "cutoff_ramp"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Resonance"
        unit="p"
        colorType="pitch"
        min={min(schema.lowpass?.resonance)}
        max={max(schema.lowpass?.resonance)}
        step={step(schema.lowpass?.resonance)}
        value={synth.lowpass.resonance}
        defaultValue={defaultSynth.lowpass.resonance}
        onInput={(v) => {
          const newSynth = update(synth, ["lowpass", "resonance"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["lowpass", "resonance"], v);
          onChange(newSynth);
        }}
      />
    </ControlSection>
  );
};

const RingControls = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
  actions,
}: ControlProps) => {
  const sampleRate = SynthEngine.sampleRate;
  return (
    <ControlSection
      title="Ring"
      iconName="ring"
      toggleable
      isOn={synth.ring.on}
      value={synth.ring}
      defaultValue={defaultSynth.ring}
      onReset={(defaultValue) => {
        const newSynth = update(synth, ["ring"], defaultValue);
        onInput(newSynth);
        onChange(newSynth);
      }}
      onToggle={() => {
        const v = !synth.ring.on;
        const newSynth = update(synth, ["ring", "on"], v);
        onInput(newSynth);
        onChange(newSynth);
      }}
      colorType="volume"
      actions={actions}
      preview={
        <PreviewCanvas
          draw={SynthVisualizer.drawLFO}
          colorType="volume"
          label="Volume"
          params={synth.ring}
          sampleRate={sampleRate}
        />
      }
    >
      <Select
        label="Shape"
        options={options(schema.ring?.shape)}
        value={synth.ring.shape}
        defaultValue={defaultSynth.ring.shape}
        onChange={(v) => {
          const newSynth = update(synth, ["ring", "shape"], v);
          onInput(newSynth);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Rate"
        unit="Hz"
        colorType="volume"
        min={min(schema.ring?.rate)}
        max={max(schema.ring?.rate)}
        step={step(schema.ring?.rate)}
        value={synth.ring.rate}
        defaultValue={defaultSynth.ring.rate}
        onInput={(v) => {
          const newSynth = update(synth, ["ring", "rate"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["ring", "rate"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Rate Ramp"
        unit="p/s"
        colorType="volume"
        min={min(schema.ring?.rate_ramp)}
        max={max(schema.ring?.rate_ramp)}
        step={step(schema.ring?.rate_ramp)}
        value={synth.ring.rate_ramp}
        defaultValue={defaultSynth.ring.rate_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["ring", "rate_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["ring", "rate_ramp"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Strength"
        unit="p"
        colorType="volume"
        min={min(schema.ring?.strength)}
        max={max(schema.ring?.strength)}
        step={step(schema.ring?.strength)}
        value={synth.ring.strength}
        defaultValue={defaultSynth.ring.strength}
        onInput={(v) => {
          const newSynth = update(synth, ["ring", "strength"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["ring", "strength"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Strength Ramp"
        unit="p/s"
        colorType="volume"
        min={min(schema.ring?.strength_ramp)}
        max={max(schema.ring?.strength_ramp)}
        step={step(schema.ring?.strength_ramp)}
        value={synth.ring.strength_ramp}
        defaultValue={defaultSynth.ring.strength_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["ring", "strength_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["ring", "strength_ramp"], v);
          onChange(newSynth);
        }}
      />
    </ControlSection>
  );
};

const WahwahControls = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
  actions,
}: ControlProps) => {
  const sampleRate = SynthEngine.sampleRate;
  return (
    <ControlSection
      title="Wahwah"
      iconName="wahwah"
      toggleable
      isOn={synth.wahwah.on}
      value={synth.wahwah}
      defaultValue={defaultSynth.wahwah}
      onReset={(defaultValue) => {
        const newSynth = update(synth, ["wahwah"], defaultValue);
        onInput(newSynth);
        onChange(newSynth);
      }}
      onToggle={() => {
        const v = !synth.wahwah.on;
        const newSynth = update(synth, ["wahwah", "on"], v);
        onInput(newSynth);
        onChange(newSynth);
      }}
      colorType="pitch"
      actions={actions}
      preview={
        <PreviewCanvas
          draw={SynthVisualizer.drawLFO}
          colorType="pitch"
          label="Bandpass"
          params={synth.wahwah}
          sampleRate={sampleRate}
        />
      }
    >
      <Select
        label="Shape"
        options={options(schema.wahwah?.shape)}
        value={synth.wahwah.shape}
        defaultValue={defaultSynth.wahwah.shape}
        onChange={(v) => {
          const newSynth = update(synth, ["wahwah", "shape"], v);
          onInput(newSynth);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Rate"
        unit="Hz"
        colorType="pitch"
        min={min(schema.wahwah?.rate)}
        max={max(schema.wahwah?.rate)}
        step={step(schema.wahwah?.rate)}
        value={synth.wahwah.rate}
        defaultValue={defaultSynth.wahwah.rate}
        onInput={(v) => {
          const newSynth = update(synth, ["wahwah", "rate"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["wahwah", "rate"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Rate Ramp"
        unit="p/s"
        colorType="pitch"
        min={min(schema.wahwah?.rate_ramp)}
        max={max(schema.wahwah?.rate_ramp)}
        step={step(schema.wahwah?.rate_ramp)}
        value={synth.wahwah.rate_ramp}
        defaultValue={defaultSynth.wahwah.rate_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["wahwah", "rate_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["wahwah", "rate_ramp"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Strength"
        unit="p"
        colorType="pitch"
        min={min(schema.wahwah?.strength)}
        max={max(schema.wahwah?.strength)}
        step={step(schema.wahwah?.strength)}
        value={synth.wahwah.strength}
        defaultValue={defaultSynth.wahwah.strength}
        onInput={(v) => {
          const newSynth = update(synth, ["wahwah", "strength"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["wahwah", "strength"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Strength Ramp"
        unit="p/s"
        colorType="pitch"
        min={min(schema.wahwah?.strength_ramp)}
        max={max(schema.wahwah?.strength_ramp)}
        step={step(schema.wahwah?.strength_ramp)}
        value={synth.wahwah.strength_ramp}
        defaultValue={defaultSynth.wahwah.strength_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["wahwah", "strength_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["wahwah", "strength_ramp"], v);
          onChange(newSynth);
        }}
      />
    </ControlSection>
  );
};

const DistortionControls = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
}: ControlProps) => {
  const sampleRate = SynthEngine.sampleRate;
  const params = useMemo(() => {
    return { ...synth.distortion, shape: synth.shape };
  }, [synth.distortion, synth.shape]);
  return (
    <ControlSection
      title="Distortion"
      iconName="distortion"
      toggleable
      isOn={synth.distortion.on}
      value={synth.distortion}
      defaultValue={defaultSynth.distortion}
      onReset={(defaultValue) => {
        const newSynth = update(synth, ["distortion"], defaultValue);
        onInput(newSynth);
        onChange(newSynth);
      }}
      onToggle={() => {
        const v = !synth.distortion.on;
        const newSynth = update(synth, ["distortion", "on"], v);
        onInput(newSynth);
        onChange(newSynth);
      }}
      preview={
        <PreviewCanvas
          draw={SynthVisualizer.drawShape}
          colorType="default"
          label="Shape"
          params={params}
          sampleRate={sampleRate}
        />
      }
    >
      <Slider
        label="Edge"
        unit="p"
        min={min(schema.distortion?.edge)}
        max={max(schema.distortion?.edge)}
        step={step(schema.distortion?.edge)}
        value={synth.distortion.edge}
        defaultValue={defaultSynth.distortion.edge}
        onInput={(v) => {
          const newSynth = update(synth, ["distortion", "edge"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["distortion", "edge"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Edge Ramp"
        unit="p/s"
        min={min(schema.distortion?.edge_ramp)}
        max={max(schema.distortion?.edge_ramp)}
        step={step(schema.distortion?.edge_ramp)}
        value={synth.distortion.edge_ramp}
        defaultValue={defaultSynth.distortion.edge_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["distortion", "edge_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["distortion", "edge_ramp"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Grit"
        unit="p"
        min={min(schema.distortion?.grit)}
        max={max(schema.distortion?.grit)}
        step={step(schema.distortion?.grit)}
        value={synth.distortion.grit}
        defaultValue={defaultSynth.distortion.grit}
        onInput={(v) => {
          const newSynth = update(synth, ["distortion", "grit"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["distortion", "grit"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Grit Ramp"
        unit="p/s"
        min={min(schema.distortion?.grit_ramp)}
        max={max(schema.distortion?.grit_ramp)}
        step={step(schema.distortion?.grit_ramp)}
        value={synth.distortion.grit_ramp}
        defaultValue={defaultSynth.distortion.grit_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["distortion", "grit_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["distortion", "grit_ramp"], v);
          onChange(newSynth);
        }}
      />
    </ControlSection>
  );
};

const BitcrushControls = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
  actions,
}: ControlProps) => {
  const sampleRate = SynthEngine.sampleRate;
  const params = useMemo(() => {
    return { ...synth.bitcrush, shape: synth.shape };
  }, [synth.bitcrush, synth.shape]);
  return (
    <ControlSection
      title="Bitcrush"
      iconName="bitcrush"
      toggleable
      isOn={synth.bitcrush.on}
      value={synth.bitcrush}
      defaultValue={defaultSynth.bitcrush}
      onReset={(defaultValue) => {
        const newSynth = update(synth, ["bitcrush"], defaultValue);
        onInput(newSynth);
        onChange(newSynth);
      }}
      onToggle={() => {
        const v = !synth.bitcrush.on;
        const newSynth = update(synth, ["bitcrush", "on"], v);
        onInput(newSynth);
        onChange(newSynth);
      }}
      actions={actions}
      preview={
        <PreviewCanvas
          draw={SynthVisualizer.drawBitcrush}
          colorType="default"
          label="Shape"
          params={params}
          sampleRate={sampleRate}
        />
      }
    >
      <Slider
        label="Crush"
        unit="p"
        min={min(schema.bitcrush?.crush)}
        max={max(schema.bitcrush?.crush)}
        step={step(schema.bitcrush?.crush)}
        value={synth.bitcrush.crush}
        defaultValue={defaultSynth.bitcrush.crush}
        onInput={(v) => {
          const newSynth = update(synth, ["bitcrush", "crush"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["bitcrush", "crush"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Crush Ramp"
        unit="p/s"
        min={min(schema.bitcrush?.crush_ramp)}
        max={max(schema.bitcrush?.crush_ramp)}
        step={step(schema.bitcrush?.crush_ramp)}
        value={synth.bitcrush.crush_ramp}
        defaultValue={defaultSynth.bitcrush.crush_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["bitcrush", "crush_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["bitcrush", "crush_ramp"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Skip"
        unit="p"
        min={min(schema.bitcrush?.skip)}
        max={max(schema.bitcrush?.skip)}
        step={step(schema.bitcrush?.skip)}
        value={synth.bitcrush.skip}
        defaultValue={defaultSynth.bitcrush.skip}
        onInput={(v) => {
          const newSynth = update(synth, ["bitcrush", "skip"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["bitcrush", "skip"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Skip Ramp"
        unit="p/s"
        min={min(schema.bitcrush?.skip_ramp)}
        max={max(schema.bitcrush?.skip_ramp)}
        step={step(schema.bitcrush?.skip_ramp)}
        value={synth.bitcrush.skip_ramp}
        defaultValue={defaultSynth.bitcrush.skip_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["bitcrush", "skip_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["bitcrush", "skip_ramp"], v);
          onChange(newSynth);
        }}
      />
    </ControlSection>
  );
};

const TremoloControls = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
  actions,
}: ControlProps) => {
  const sampleRate = SynthEngine.sampleRate;
  return (
    <ControlSection
      title="Tremolo"
      iconName="tremolo"
      toggleable
      isOn={synth.tremolo.on}
      value={synth.tremolo}
      defaultValue={defaultSynth.tremolo}
      onReset={(defaultValue) => {
        const newSynth = update(synth, ["tremolo"], defaultValue);
        onInput(newSynth);
        onChange(newSynth);
      }}
      onToggle={() => {
        const v = !synth.tremolo.on;
        const newSynth = update(synth, ["tremolo", "on"], v);
        onInput(newSynth);
        onChange(newSynth);
      }}
      colorType="volume"
      actions={actions}
      preview={
        <PreviewCanvas
          draw={SynthVisualizer.drawLFO}
          colorType="volume"
          label="Volume"
          params={synth.tremolo}
          sampleRate={sampleRate}
        />
      }
    >
      <Select
        label="Shape"
        options={options(schema.tremolo?.shape)}
        value={synth.tremolo.shape}
        defaultValue={defaultSynth.tremolo.shape}
        onChange={(v) => {
          const newSynth = update(synth, ["tremolo", "shape"], v);
          onInput(newSynth);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Rate"
        unit="Hz"
        colorType="volume"
        min={min(schema.tremolo?.rate)}
        max={max(schema.tremolo?.rate)}
        step={step(schema.tremolo?.rate)}
        value={synth.tremolo.rate}
        defaultValue={defaultSynth.tremolo.rate}
        onInput={(v) => {
          const newSynth = update(synth, ["tremolo", "rate"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["tremolo", "rate"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Rate Ramp"
        unit="p/s"
        colorType="volume"
        min={min(schema.tremolo?.rate_ramp)}
        max={max(schema.tremolo?.rate_ramp)}
        step={step(schema.tremolo?.rate_ramp)}
        value={synth.tremolo.rate_ramp}
        defaultValue={defaultSynth.tremolo.rate_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["tremolo", "rate_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["tremolo", "rate_ramp"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Strength"
        unit="p"
        colorType="volume"
        min={min(schema.tremolo?.strength)}
        max={max(schema.tremolo?.strength)}
        step={step(schema.tremolo?.strength)}
        value={synth.tremolo.strength}
        defaultValue={defaultSynth.tremolo.strength}
        onInput={(v) => {
          const newSynth = update(synth, ["tremolo", "strength"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["tremolo", "strength"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Strength Ramp"
        unit="p/s"
        colorType="volume"
        min={min(schema.tremolo?.strength_ramp)}
        max={max(schema.tremolo?.strength_ramp)}
        step={step(schema.tremolo?.strength_ramp)}
        value={synth.tremolo.strength_ramp}
        defaultValue={defaultSynth.tremolo.strength_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["tremolo", "strength_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["tremolo", "strength_ramp"], v);
          onChange(newSynth);
        }}
      />
    </ControlSection>
  );
};

const VibratoControls = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
  actions,
}: ControlProps) => {
  const sampleRate = SynthEngine.sampleRate;
  return (
    <ControlSection
      title="Vibrato"
      iconName="vibrato"
      toggleable
      isOn={synth.vibrato.on}
      value={synth.vibrato}
      defaultValue={defaultSynth.vibrato}
      onReset={(defaultValue) => {
        const newSynth = update(synth, ["vibrato"], defaultValue);
        onInput(newSynth);
        onChange(newSynth);
      }}
      onToggle={() => {
        const v = !synth.vibrato.on;
        const newSynth = update(synth, ["vibrato", "on"], v);
        onInput(newSynth);
        onChange(newSynth);
      }}
      colorType="pitch"
      actions={actions}
      preview={
        <PreviewCanvas
          draw={SynthVisualizer.drawLFO}
          colorType="pitch"
          label="Pitch"
          params={synth.vibrato}
          sampleRate={sampleRate}
        />
      }
    >
      <Select
        label="Shape"
        options={options(schema.vibrato?.shape)}
        value={synth.vibrato.shape}
        defaultValue={defaultSynth.vibrato.shape}
        onChange={(v) => {
          const newSynth = update(synth, ["vibrato", "shape"], v);
          onInput(newSynth);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Rate"
        unit="Hz"
        colorType="pitch"
        min={min(schema.vibrato?.rate)}
        max={max(schema.vibrato?.rate)}
        step={step(schema.vibrato?.rate)}
        value={synth.vibrato.rate}
        defaultValue={defaultSynth.vibrato.rate}
        onInput={(v) => {
          const newSynth = update(synth, ["vibrato", "rate"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["vibrato", "rate"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Rate Ramp"
        unit="p/s"
        colorType="pitch"
        min={min(schema.vibrato?.rate_ramp)}
        max={max(schema.vibrato?.rate_ramp)}
        step={step(schema.vibrato?.rate_ramp)}
        value={synth.vibrato.rate_ramp}
        defaultValue={defaultSynth.vibrato.rate_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["vibrato", "rate_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["vibrato", "rate_ramp"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Strength"
        unit="p"
        colorType="pitch"
        min={min(schema.vibrato?.strength)}
        max={max(schema.vibrato?.strength)}
        step={step(schema.vibrato?.strength)}
        value={synth.vibrato.strength}
        defaultValue={defaultSynth.vibrato.strength}
        onInput={(v) => {
          const newSynth = update(synth, ["vibrato", "strength"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["vibrato", "strength"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Strength Ramp"
        unit="p/s"
        colorType="pitch"
        min={min(schema.vibrato?.strength_ramp)}
        max={max(schema.vibrato?.strength_ramp)}
        step={step(schema.vibrato?.strength_ramp)}
        value={synth.vibrato.strength_ramp}
        defaultValue={defaultSynth.vibrato.strength_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["vibrato", "strength_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["vibrato", "strength_ramp"], v);
          onChange(newSynth);
        }}
      />
    </ControlSection>
  );
};

const ArpeggioControls = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
}: ControlProps) => {
  const sampleRate = SynthEngine.sampleRate;
  const params = useMemo(() => {
    return { ...synth.arpeggio, shape: synth.shape };
  }, [synth.arpeggio, synth.shape]);
  return (
    <ControlSection
      title="Arpeggio"
      iconName="arpeggio"
      toggleable
      isOn={synth.arpeggio.on}
      value={synth.arpeggio}
      defaultValue={defaultSynth.arpeggio}
      onReset={(defaultValue) => {
        const newSynth = update(synth, ["arpeggio"], defaultValue);
        onInput(newSynth);
        onChange(newSynth);
      }}
      onToggle={() => {
        const v = !synth.arpeggio.on;
        const newSynth = update(synth, ["arpeggio", "on"], v);
        onInput(newSynth);
        onChange(newSynth);
      }}
      colorType="pitch"
      preview={
        <>
          <PreviewCanvas
            draw={SynthVisualizer.drawArpeggioTones}
            colorType="pitch"
            label="Pitch"
            classes="grow-0 min-h-40"
            params={params}
            sampleRate={sampleRate}
          />
          <PreviewCanvas
            draw={SynthVisualizer.drawArpeggioLevels}
            colorType="volume"
            label="Volume"
            classes="grow-0 min-h-40 border-t border-engine-800"
            params={params}
            sampleRate={sampleRate}
          />
          <PreviewCanvas
            draw={SynthVisualizer.drawArpeggioShapes}
            colorType="default"
            label="Shape"
            classes="grow-0 min-h-40 border-t border-engine-800"
            params={params}
            sampleRate={sampleRate}
          />
        </>
      }
    >
      <Slider
        label="Rate"
        unit="n/s "
        colorType="pitch"
        min={min(schema.arpeggio?.rate)}
        max={max(schema.arpeggio?.rate)}
        step={step(schema.arpeggio?.rate)}
        value={synth.arpeggio.rate}
        defaultValue={defaultSynth.arpeggio.rate}
        onInput={(v) => {
          const newSynth = update(synth, ["arpeggio", "rate"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["arpeggio", "rate"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Rate Ramp"
        unit="n/s²"
        colorType="pitch"
        min={min(schema.arpeggio?.rate_ramp)}
        max={max(schema.arpeggio?.rate_ramp)}
        step={step(schema.arpeggio?.rate_ramp)}
        value={synth.arpeggio.rate_ramp}
        defaultValue={defaultSynth.arpeggio.rate_ramp}
        onInput={(v) => {
          const newSynth = update(synth, ["arpeggio", "rate_ramp"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["arpeggio", "rate_ramp"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Max Octaves"
        unit="oct"
        colorType="pitch"
        min={min(schema.arpeggio?.max_octaves)}
        max={max(schema.arpeggio?.max_octaves)}
        step={step(schema.arpeggio?.max_octaves)}
        value={synth.arpeggio.max_octaves}
        defaultValue={defaultSynth.arpeggio.max_octaves}
        onInput={(v) => {
          const newSynth = update(synth, ["arpeggio", "max_octaves"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["arpeggio", "max_octaves"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Max Notes"
        unit="n"
        colorType="pitch"
        min={min(schema.arpeggio?.max_notes)}
        max={max(schema.arpeggio?.max_notes)}
        step={step(schema.arpeggio?.max_notes)}
        value={synth.arpeggio.max_notes}
        defaultValue={defaultSynth.arpeggio.max_notes}
        onInput={(v) => {
          const newSynth = update(synth, ["arpeggio", "max_notes"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["arpeggio", "max_notes"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Glide"
        unit="s"
        colorType="pitch"
        min={min(schema.arpeggio?.glide)}
        max={max(schema.arpeggio?.glide)}
        step={step(schema.arpeggio?.glide)}
        value={synth.arpeggio.glide}
        defaultValue={defaultSynth.arpeggio.glide}
        onInput={(v) => {
          const newSynth = update(synth, ["arpeggio", "glide"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["arpeggio", "glide"], v);
          onChange(newSynth);
        }}
      />
      <Select
        label="Direction"
        options={options(schema.arpeggio?.direction)}
        value={synth.arpeggio.direction}
        defaultValue={defaultSynth.arpeggio.direction}
        onChange={(v) => {
          const newSynth = update(synth, ["arpeggio", "direction"], v);
          onInput(newSynth);
          onChange(newSynth);
        }}
      />
      <ArpStepList
        synth={synth}
        defaultSynth={defaultSynth}
        schema={schema}
        onInput={onInput}
        onChange={onChange}
      />
    </ControlSection>
  );
};

const ArpStepList = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
}: ControlProps) => {
  const numArpNotes = Math.max(
    synth.arpeggio.tones.length,
    synth.arpeggio.levels.length,
    synth.arpeggio.shapes.length,
    synth.arpeggio.phases.length,
  );
  const arpSteps = Array(numArpNotes)
    .fill(undefined)
    .map((_, i) => ({
      tone: synth.arpeggio.tones[i] ?? 0,
      level: synth.arpeggio.levels[i] ?? undefined,
      shape: synth.arpeggio.shapes[i] ?? undefined,
      phase: synth.arpeggio.phases[i] ?? undefined,
    }));
  return (
    <div className="space-y-2 mt-3">
      {arpSteps.map((arpStep, i) => (
        <div
          key={i}
          className="bg-engine-950/40 p-2 rounded-sm border border-engine-800 flex flex-col"
        >
          <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-engine-800/80">
            <span className="text-[10px] font-semibold text-engine-400 uppercase tracking-wide">
              Note {i + 1}
            </span>
            <div className="flex items-center space-x-0.5">
              <button
                disabled={i === 0}
                className={`cursor-pointer p-0.5 rounded-sm text-engine-500 not-disabled:hover:text-engine-300 bg-engine-800 not-disabled:hover:bg-engine-700 disabled:opacity-30 disabled:cursor-default`}
                onClick={() => {
                  const n = [...arpSteps];
                  [n[i], n[i - 1]] = [n[i - 1], n[i]];
                  const newSynth = update(
                    update(
                      update(
                        update(
                          synth,
                          ["arpeggio", "tones"],
                          n.map((n) => n.tone),
                        ),
                        ["arpeggio", "levels"],
                        n.map((n) => n.level),
                      ),
                      ["arpeggio", "shapes"],
                      n.map((n) => n.shape),
                    ),
                    ["arpeggio", "phases"],
                    n.map((n) => n.phase),
                  );
                  onInput(newSynth);
                  onChange(newSynth);
                }}
              >
                <Icon name="chevronUp" size={14} />
              </button>
              <button
                disabled={i === arpSteps.length - 1}
                className={`cursor-pointer p-0.5 rounded-sm text-engine-500 not-disabled:hover:text-engine-300 bg-engine-800 not-disabled:hover:bg-engine-700 disabled:opacity-30 disabled:cursor-default`}
                onClick={() => {
                  const n = [...arpSteps];
                  [n[i], n[i + 1]] = [n[i + 1], n[i]];
                  const newSynth = update(
                    update(
                      update(
                        update(
                          synth,
                          ["arpeggio", "tones"],
                          n.map((n) => n.tone),
                        ),
                        ["arpeggio", "levels"],
                        n.map((n) => n.level),
                      ),
                      ["arpeggio", "shapes"],
                      n.map((n) => n.shape),
                    ),
                    ["arpeggio", "phases"],
                    n.map((n) => n.phase),
                  );
                  onInput(newSynth);
                  onChange(newSynth);
                }}
              >
                <Icon name="chevronDown" size={14} />
              </button>
              <div className="w-px h-3 bg-engine-700 mx-1"></div>
              <button
                disabled={arpSteps.length <= 1}
                className={`cursor-pointer p-0.5 rounded-sm text-engine-500 not-disabled:hover:text-red-400 bg-engine-800 not-disabled:hover:bg-engine-700 disabled:opacity-30 disabled:cursor-default`}
                onClick={() => {
                  const n = arpSteps.filter((_, idx) => idx !== i);
                  const newSynth = update(
                    update(
                      update(
                        update(
                          synth,
                          ["arpeggio", "tones"],
                          n.map((n) => n.tone),
                        ),
                        ["arpeggio", "levels"],
                        n.map((n) => n.level),
                      ),
                      ["arpeggio", "shapes"],
                      n.map((n) => n.shape),
                    ),
                    ["arpeggio", "phases"],
                    n.map((n) => n.phase),
                  );
                  onInput(newSynth);
                  onChange(newSynth);
                }}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Slider
              label="Tone"
              unit="st"
              colorType="pitch"
              min={min(schema.arpeggio?.tones)}
              max={max(schema.arpeggio?.tones)}
              step={step(schema.arpeggio?.tones)}
              value={arpStep.tone}
              defaultValue={defaultSynth.arpeggio.tones?.[i]}
              onInput={(v) => {
                const newSynth = update(synth, ["arpeggio", "tones", i], v);
                onInput(newSynth);
              }}
              onChange={(v) => {
                const newSynth = update(synth, ["arpeggio", "tones", i], v);
                onChange(newSynth);
              }}
            />
            <Slider
              label="Level"
              unit="p"
              colorType="volume"
              min={min(schema.arpeggio?.levels)}
              max={max(schema.arpeggio?.levels)}
              step={step(schema.arpeggio?.levels)}
              value={arpStep.level ?? 1}
              defaultValue={defaultSynth.arpeggio.levels?.[i] ?? 1}
              onInput={(v) => {
                const newSynth = update(synth, ["arpeggio", "levels", i], v);
                onInput(newSynth);
              }}
              onChange={(v) => {
                const newSynth = update(synth, ["arpeggio", "levels", i], v);
                onChange(newSynth);
              }}
            />
            <Slider
              label="Phase"
              unit="p"
              min={min(schema.arpeggio?.phases)}
              max={max(schema.arpeggio?.phases)}
              step={step(schema.arpeggio?.phases)}
              value={arpStep.phase ?? 0}
              defaultValue={defaultSynth.arpeggio.phases?.[i] ?? 0}
              onInput={(v) => {
                const newSynth = update(synth, ["arpeggio", "phases", i], v);
                onInput(newSynth);
              }}
              onChange={(v) => {
                const newSynth = update(synth, ["arpeggio", "phases", i], v);
                onChange(newSynth);
              }}
            />
            <Select
              label="Shape"
              options={options(schema.arpeggio?.shapes)}
              value={arpStep.shape ?? synth.shape}
              defaultValue={defaultSynth.arpeggio.shapes?.[i] ?? synth.shape}
              onChange={(v) => {
                const newSynth = update(synth, ["arpeggio", "shapes", i], v);
                onInput(newSynth);
                onChange(newSynth);
              }}
            />
          </div>
        </div>
      ))}
      <button
        className="cursor-pointer w-full py-2 mt-2 flex justify-center items-center space-x-1.5 text-xs font-semibold text-engine-400 hover:text-sky-400 border border-dashed border-engine-700 hover:border-sky-700/50 rounded-sm bg-engine-900/40 hover:bg-sky-900/10 transition-all"
        onClick={() => {
          const n = [
            ...arpSteps,
            { tone: 0, level: undefined, shape: undefined, phase: undefined },
          ];
          const newSynth = update(
            update(
              update(
                update(
                  synth,
                  ["arpeggio", "tones"],
                  n.map((n) => n.tone),
                ),
                ["arpeggio", "levels"],
                n.map((n) => n.level),
              ),
              ["arpeggio", "shapes"],
              n.map((n) => n.shape),
            ),
            ["arpeggio", "phases"],
            n.map((n) => n.phase),
          );
          onInput(newSynth);
          onChange(newSynth);
        }}
      >
        <Icon name="plus" size={14} />
        <span>Add Note</span>
      </button>
    </div>
  );
};

const DelayControls = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
  actions,
}: ControlProps) => {
  const sampleRate = SynthEngine.sampleRate;
  return (
    <ControlSection
      title="Delay"
      iconName="delay"
      toggleable
      isOn={synth.delay.on}
      value={synth.delay}
      defaultValue={defaultSynth.delay}
      onReset={(defaultValue) => {
        const newSynth = update(synth, ["delay"], defaultValue);
        onInput(newSynth);
        onChange(newSynth);
      }}
      onToggle={() => {
        const v = !synth.delay.on;
        const newSynth = update(synth, ["delay", "on"], v);
        onInput(newSynth);
        onChange(newSynth);
      }}
      preview={
        <PreviewCanvas
          draw={SynthVisualizer.drawDelay}
          colorType="default"
          label="Delay"
          params={synth.delay}
          sampleRate={sampleRate}
        />
      }
      actions={actions}
    >
      <Slider
        label="Length"
        unit="s"
        min={min(schema.delay?.length)}
        max={max(schema.delay?.length)}
        step={step(schema.delay?.length)}
        value={synth.delay.length}
        defaultValue={defaultSynth.delay.length}
        onInput={(v) => {
          const newSynth = update(synth, ["delay", "length"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["delay", "length"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Strength"
        unit="p"
        min={min(schema.delay?.strength)}
        max={max(schema.delay?.strength)}
        step={step(schema.delay?.strength)}
        value={synth.delay.strength}
        defaultValue={defaultSynth.delay.strength}
        onInput={(v) => {
          const newSynth = update(synth, ["delay", "strength"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["delay", "strength"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Feedback"
        unit="p"
        min={min(schema.delay?.feedback)}
        max={max(schema.delay?.feedback)}
        step={step(schema.delay?.feedback)}
        value={synth.delay.feedback}
        defaultValue={defaultSynth.delay.feedback}
        onInput={(v) => {
          const newSynth = update(synth, ["delay", "feedback"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["delay", "feedback"], v);
          onChange(newSynth);
        }}
      />
    </ControlSection>
  );
};

const ReverbControls = ({
  synth,
  defaultSynth,
  schema,
  onInput,
  onChange,
}: ControlProps) => {
  const sampleRate = SynthEngine.sampleRate;
  return (
    <ControlSection
      title="Reverb"
      iconName="reverb"
      toggleable
      isOn={synth.reverb.on}
      value={synth.reverb}
      defaultValue={defaultSynth.reverb}
      onReset={(defaultValue) => {
        const newSynth = update(synth, ["reverb"], defaultValue);
        onInput(newSynth);
        onChange(newSynth);
      }}
      onToggle={() => {
        const v = !synth.reverb.on;
        const newSynth = update(synth, ["reverb", "on"], v);
        onInput(newSynth);
        onChange(newSynth);
      }}
      preview={
        <PreviewCanvas
          draw={SynthVisualizer.drawReverb}
          colorType="default"
          label="Reverb"
          params={synth.reverb}
          sampleRate={sampleRate}
        />
      }
    >
      <Slider
        label="Room Size"
        unit="p"
        min={min(schema.reverb?.room_size)}
        max={max(schema.reverb?.room_size)}
        step={step(schema.reverb?.room_size)}
        value={synth.reverb.room_size}
        defaultValue={defaultSynth.reverb.room_size}
        onInput={(v) => {
          const newSynth = update(synth, ["reverb", "room_size"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["reverb", "room_size"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Mix"
        unit="p"
        min={min(schema.reverb?.mix)}
        max={max(schema.reverb?.mix)}
        step={step(schema.reverb?.mix)}
        value={synth.reverb.mix}
        defaultValue={defaultSynth.reverb.mix}
        onInput={(v) => {
          const newSynth = update(synth, ["reverb", "mix"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["reverb", "mix"], v);
          onChange(newSynth);
        }}
      />
      <Slider
        label="Damping"
        unit="p"
        min={min(schema.reverb?.damping)}
        max={max(schema.reverb?.damping)}
        step={step(schema.reverb?.damping)}
        value={synth.reverb.damping}
        defaultValue={defaultSynth.reverb.damping}
        onInput={(v) => {
          const newSynth = update(synth, ["reverb", "damping"], v);
          onInput(newSynth);
        }}
        onChange={(v) => {
          const newSynth = update(synth, ["reverb", "damping"], v);
          onChange(newSynth);
        }}
      />
    </ControlSection>
  );
};

interface FilePanelProps {
  synth: Synth;
  onImportAudio: (buffer: AudioBuffer | null) => void;
}

const FilePanel = ({ synth, onImportAudio }: FilePanelProps) => {
  const [copied, setCopied] = useState<boolean>(false);

  const synthJSONObj: Record<string, unknown> = useMemo(() => {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(synth)) {
      if (!k.startsWith("$")) {
        if (v && (typeof v !== "object" || !("on" in v) || v.on)) {
          obj[k] = v;
        }
      }
    }
    return obj;
  }, [synth]);

  const handleFileChange = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const audioCtx = SynthEngine.getAudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      onImportAudio(audioBuffer);
    } catch (err) {
      console.error("Error decoding audio file:", err);
      alert("Failed to decode audio file. Ensure it is a valid audio format.");
    }

    // Reset input so the same file can be imported again if it was cleared
    input.value = "";
  };

  return (
    <div className="max-w-2xl mx-auto space-y-3 pb-12">
      <div className="bg-engine-900 border border-engine-800 rounded-md p-4">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-1.5 bg-sky-900/30 text-sky-400 rounded-sm">
            <Icon name="fileAudio" size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-engine-200">
              Export Audio
            </h3>
            <p className="text-[11px] text-engine-400">
              Download currently synthesized sound as a .wav file.
            </p>
          </div>
        </div>
        <button
          className="cursor-pointer w-full flex items-center justify-center space-x-2 bg-engine-800 hover:bg-engine-700 border border-engine-700 text-engine-200 font-semibold py-2 px-3 rounded-sm transition-all"
          onClick={() => {
            const b = SynthEngine.generateBuffers(synth);
            const url = URL.createObjectURL(
              SynthEngine.encodeWAV(
                b.soundBuffer,
                SynthEngine.getAudioContext().sampleRate,
              ),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = `synth_${Date.now()}.wav`;
            a.click();
          }}
        >
          <Icon name="download" size={16} />
          <span className="text-xs">Download .WAV</span>
        </button>
      </div>

      <div className="bg-engine-900 border border-engine-800 rounded-md p-4">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-1.5 bg-violet-900/30 text-violet-400 rounded-sm">
            <Icon name="fileAudio" size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-engine-200">
              Import Reference
            </h3>
            <p className="text-[11px] text-engine-400">
              Compare an audio waveform with the synth's.
            </p>
          </div>
        </div>
        <label className="cursor-pointer w-full flex items-center justify-center space-x-2 bg-engine-800 hover:bg-engine-700 border border-engine-700 text-engine-200 font-semibold py-2 px-3 rounded-sm transition-all">
          <Icon name="upload" size={14} />
          <span className="text-xs">Import Reference</span>
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onInput={handleFileChange}
          />
        </label>
      </div>

      <div className="bg-engine-900 border border-engine-800 rounded-md p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="p-1.5 bg-amber-900/30 text-amber-400 rounded-sm">
              <Icon name="settings" size={18} />
            </div>
            <h3 className="text-sm font-semibold text-engine-200">Config</h3>
          </div>
          <button
            className={`cursor-pointer flex items-center space-x-1.5 px-2 py-1 rounded-sm text-[10px] font-semibold transition-all ${
              copied
                ? "bg-green-900/50 text-green-400 border border-green-700/50"
                : "bg-engine-800 text-engine-300 hover:text-white border border-engine-700 hover:border-engine-500"
            }`}
            onClick={() => {
              navigator.clipboard.writeText(
                JSON.stringify(synthJSONObj, null, 2),
              );
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? (
              <Icon name="check" size={12} />
            ) : (
              <Icon name="copy" size={12} />
            )}
            <span>{copied ? "COPIED!" : "COPY JSON"}</span>
          </button>
        </div>
        <pre className="bg-engine-950 border border-engine-800/80 rounded-sm p-3 text-[10px] text-engine-400 font-mono max-h-80 select-text overflow-auto scrollbar-thin scrollbar-thumb-white/50 scrollbar-track-white/15">
          {JSON.stringify(synthJSONObj, null, 2)}
        </pre>
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface SynthInspectorProps {
  value?: Synth;
  onInput?: (value: Synth) => void;
  onChange?: (value: Synth) => void;
}

export default function SynthInspector({
  value = DEFAULT_SYNTH,
  onInput,
  onChange,
}: SynthInspectorProps) {
  const [synth, setSynth] = useState<Synth>(value);
  const [previewSynth, setPreviewSynth] = useState<Synth>(value);
  const [defaultSynth, setDefaultSynth] = useState<Synth>(DEFAULT_SYNTH);
  const [activeTab, setActiveTab] = useState<string>("edit");
  const [view, setView] = useState({ start: 0, end: 1 });
  const [playOnChange, setPlayOnChange] = useState<boolean>(true);
  const [importedAudio, setImportedAudio] = useState<AudioBuffer | null>(null);

  useEffect(() => {
    setSynth(value);
  }, [value]);

  const handleInput = useCallback(
    (synth: Synth) => {
      onInput?.(synth);
      onChange?.(synth);
      setSynth(synth);
    },
    [onInput, onChange],
  );

  const handleChange = useCallback(
    (synth: Synth) => {
      if (playOnChange) {
        SynthEngine.playSynth(synth);
      }
      setSynth(synth);
      setPreviewSynth(synth);
      onChange?.(synth);
    },
    [playOnChange, onChange],
  );

  const handleRandomize = useCallback((synth: Synth) => {
    setSynth(synth);
    setPreviewSynth(synth);
    setDefaultSynth(synth);
    setView({ start: 0, end: 1 });
  }, []);

  return (
    <div className="h-full min-h-screen w-full text-engine-200 font-sans flex flex-col overflow-hidden select-none bg-engine-950">
      <div className="shrink-0 flex flex-col bg-engine-950 border-b border-engine-800 z-20">
        <TopBar
          synth={synth}
          autoPlay={playOnChange}
          onChangeAutoPlay={setPlayOnChange}
        />
        <MainPreview
          synth={previewSynth}
          view={view}
          onViewChange={setView}
          importedAudio={importedAudio}
        />
        <TabNavigationBar active={activeTab} onChange={setActiveTab} />
      </div>

      <div className="flex-1 p-3 md:p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-white/15 scrollbar-track-black/50">
        {activeTab === "randomize" && (
          <RandomizePanel onRandomize={handleRandomize} />
        )}
        {activeTab === "edit" && (
          <EditPanel
            synth={synth}
            defaultSynth={defaultSynth}
            onInput={handleInput}
            onChange={handleChange}
          />
        )}
        {activeTab === "file" && (
          <FilePanel synth={synth} onImportAudio={setImportedAudio} />
        )}
      </div>
    </div>
  );
}
