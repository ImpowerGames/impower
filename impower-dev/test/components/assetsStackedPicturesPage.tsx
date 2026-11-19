import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import { render } from "preact";
import Assets from "../../src/modules/spark-editor/components/assets";
import { setAssetFiles } from "../../src/modules/spark-editor/utils/assetTypes";
import { PROJECT_SETTINGS_SCHEMA } from "../../src/modules/spark-editor/workspace/settings/settingsSchema";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";

const SQUARE = { left: 100, top: 150, right: 200, bottom: 250, width: 300, height: 400 } as const;

type Setup = { folder: string; crowd?: number; switches?: boolean };

const png = async (paint: (context: OffscreenCanvasRenderingContext2D) => void) => {
  const canvas = new OffscreenCanvas(SQUARE.width, SQUARE.height);
  paint(canvas.getContext("2d")!);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Promise<string>((done) => {
    const reader = new FileReader();
    reader.onload = () => done(reader.result as string);
    reader.readAsDataURL(blob);
  });
};

const square = (context: OffscreenCanvasRenderingContext2D, colour: string) => {
  context.fillStyle = colour;
  context.fillRect(SQUARE.left, SQUARE.top, SQUARE.right - SQUARE.left, SQUARE.bottom - SQUARE.top);
};

declare global {
  interface Window {
    stackedPage: { mount: (setup: Setup) => Promise<void>; bases: Record<string, string>; redefine: (script: string) => void };
  }
}

window.stackedPage = {
  bases: {},
  redefine: (script) => {
    window.stackedScript = script;
    sendProtocolMessage(CompiledProgramMessage.type.notification({ program: {} } as never));
  },
  mount: async ({ folder, crowd = 0, switches = false }) => {
    const base = await png((context) => {
      context.fillStyle = "#2050c0";
      context.fillRect(0, 0, SQUARE.width, SQUARE.height);
      square(context, "#000000");
    });
    const happy = await png((context) => square(context, "#e02020"));
    const sad = await png((context) => square(context, "#20c020"));
    const plain = await png((context) => {
      context.fillStyle = "#808080";
      context.fillRect(0, 0, SQUARE.width, SQUARE.height);
    });
    const P = "Assets/Images/Portraits";
    const sources: Record<string, string> = {
      [`${P}/imani.png`]: base,
      [`${P}/imani face.happy default.png`]: happy,
      [`${P}/imani face.sad.png`]: sad,
      [`${P}/bunny.png`]: plain,
    };
    if (switches) {
      sources[`${P}/mia/90 hat.on.png`] = happy;
      sources[`${P}/mia/30 glasses.on.png`] = sad;
    }
    for (let index = 0; index < crowd; index += 1) {
      const name = `Assets/Images/Crowd/person_${String(index).padStart(3, "0")}`;
      sources[`${name}.png`] = base;
      sources[`${name} face.smile default.png`] = happy;
      sources[`${name} face.frown.png`] = sad;
    }
    const files = Object.fromEntries(
      Object.entries(sources).map(([path, src], index) => [path, { modified: Date.now() - index, size: 100, src }]),
    );
    window.stackedPage.bases = Object.fromEntries(
      Object.entries(sources).filter(([path]) => !path.includes("~")),
    );
    setAssetFiles({
      imageFiles: PROJECT_SETTINGS_SCHEMA.imageFiles.default,
      audioFiles: PROJECT_SETTINGS_SCHEMA.audioFiles.default,
      videoFiles: PROJECT_SETTINGS_SCHEMA.videoFiles.default,
      fontFiles: PROJECT_SETTINGS_SCHEMA.fontFiles.default,
    });
    workspace.current = {
      ...workspace.current,
      project: { ...workspace.current.project, id: "p" },
      lists: { assetsFolders: { image: folder } },
    };
    workspace.assetListing.value = { projectId: "p", files, folders: [] };
    const host = document.body.appendChild(document.createElement("div"));
    host.className = "flex h-screen flex-col";
    render(<Assets />, host);
  },
};
