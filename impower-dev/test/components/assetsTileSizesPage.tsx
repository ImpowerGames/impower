import { render } from "preact";
import { useRef } from "preact/hooks";
import Assets from "../../src/modules/spark-editor/components/assets";
import { useNarrowPane } from "../../src/modules/spark-editor/components/assets/useNarrowPane";
import { setAssetFiles } from "../../src/modules/spark-editor/utils/assetTypes";
import { PROJECT_SETTINGS_SCHEMA } from "../../src/modules/spark-editor/workspace/settings/settingsSchema";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";

type Setup = {
  width?: number;
  lists?: Record<string, unknown>;
  pictures?: number;
  extraPictures?: readonly string[];
  counted?: boolean;
  reveal?: readonly string[];
};

const picture = (index: number, width: number, height: number) => {
  const hue = (index * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="hsl(${hue} 60% 50%)"/><rect x="${width / 4}" y="${height / 4}" width="${width / 2}" height="${height / 2}" fill="hsl(${hue} 60% 30%)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const SHAPES: readonly [number, number][] = [
  [300, 400],
  [640, 400],
  [1200, 400],
];

type GridShot = { list: boolean; columns: number; cells: number[] };

const gridShot = (): GridShot => {
  const list = document.querySelector<HTMLElement>('[role="list"]');
  const cells = [...(list?.querySelectorAll<HTMLElement>('[role="listitem"]') ?? [])].map((cell) => cell.getBoundingClientRect());
  const top = Math.min(...cells.map((cell) => cell.top));
  const first = cells.filter((cell) => Math.abs(cell.top - top) < 0.5).sort((a, b) => a.left - b.left);
  return { list: !!list, columns: first.length, cells: first.map((cell) => Math.round(cell.left * 100) / 100) };
};

declare global {
  interface Window {
    assetsPage: { mount: (setup: Setup) => void; lists: () => Record<string, unknown>; grid: () => GridShot; firstFrame?: GridShot; narrowAt: (width: number) => Promise<boolean | undefined> };
  }
}

window.assetsPage = {
  mount: ({ width, lists = {}, pictures = 3, extraPictures = [], counted = false, reveal }) => {
    const files: Record<string, { modified: number; size: number; src: string }> = {
      "Assets/Images/Cast/Crew/one.png": { modified: Date.now() - 86_400_000, size: 900, src: picture(99, 300, 400) },
    };
    for (let index = 0; index < pictures; index += 1) {
      const [w, h] = SHAPES[index % SHAPES.length]!;
      const name = `Assets/Images/Cast/picture_${String(index).padStart(3, "0")}.png`;
      files[name] = { modified: Date.now() - 2 * 86_400_000, size: 1000 + index, src: picture(index, w, h) };
    }
    extraPictures.forEach((name, index) => {
      files[name] = { modified: Date.now() - 3 * 86_400_000, size: 2000 + index, src: picture(200 + index, 300, 400) };
    });
    files["Assets/Audio/Sounds/chime.wav"] = { modified: Date.now(), size: 10, src: "/chime.wav" };
    setAssetFiles({
      imageFiles: PROJECT_SETTINGS_SCHEMA.imageFiles.default,
      audioFiles: PROJECT_SETTINGS_SCHEMA.audioFiles.default,
      videoFiles: PROJECT_SETTINGS_SCHEMA.videoFiles.default,
      fontFiles: PROJECT_SETTINGS_SCHEMA.fontFiles.default,
    });
    workspace.current = {
      ...workspace.current,
      project: { ...workspace.current.project, id: "p" },
      lists: { assetsFolders: { image: "Assets/Images/Cast" }, ...lists },
    };
    workspace.assetListing.value = { projectId: "p", files, folders: [] };
    workspace.assetsReveal.value = reveal ?? null;
    workspace.assetUsage.value = counted ? { projectId: "p", version: 1, uses: {}, order: [] } : null;
    const host = document.body.appendChild(document.createElement("div"));
    host.id = "host";
    host.className = "flex h-screen flex-col";
    if (width) {
      host.style.width = `${width}px`;
    }
    render(<Assets />, host);
    requestAnimationFrame(() => {
      window.assetsPage.firstFrame = gridShot();
    });
  },
  grid: gridShot,
  narrowAt: (width) =>
    new Promise((done) => {
      const host = document.body.appendChild(document.createElement("div"));
      function Probe() {
        const body = useRef<HTMLDivElement | null>(null);
        const narrow = useNarrowPane(body);
        if (narrow !== undefined) {
          requestAnimationFrame(() => {
            done(narrow);
            render(null, host);
            host.remove();
          });
        }
        return <div ref={body} style={`width:${width}px;padding:0 18px;box-sizing:border-box`} />;
      }
      render(<Probe />, host);
    }),
  lists: () => ({ ...workspace.current.lists }),
};
