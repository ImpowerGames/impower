import {
  ArrowIcon,
  BracketsIcon,
  Button,
  DownloadIcon,
  FeatureCard,
  FileIcon,
  PageFrame,
  PeopleIcon,
  PlayIcon,
  ShareIcon,
} from "@impower/impower-ui/components";
import { useRef, useState } from "preact/hooks";
import { screenplaySummary } from "../../workspace/settings/screenplaySettings";
import { useSettings } from "../../workspace/settings/useSettings";
import workspace from "../../workspace/WorkspaceStore";
import { downloadFile } from "../../utils/downloadFile";

const MARKETPLACE_URL = "https://marketplace.visualstudio.com/items?itemName=impowergames.vscode-sparkdown";

type ExportFormat = "pdf" | "html";

const backToStory = async () => {
  const { Workspace } = await import("../../workspace/Workspace");
  Workspace.window.navigateTo("write");
};

function ScreenplayExport() {
  const { projectSettings } = useSettings();
  const [running, setRunning] = useState<ExportFormat | null>(null);
  const [percent, setPercent] = useState(0);
  const inFlight = useRef(false);

  const runExport = async (format: ExportFormat) => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setRunning(format);
    setPercent(0);
    try {
      const project = workspace.current.project;
      if (!project?.id || !project.name) {
        return;
      }
      const { Workspace } = await import("../../workspace/Workspace");
      const programs = [await Workspace.fs.readProjectScriptBundle(project.id)];
      const onProgress = (value?: { percentage?: number }) => setPercent(Math.round(value?.percentage ?? 0));
      if (format === "pdf") {
        const pdf = await Workspace.print.exportPDF(programs, onProgress);
        downloadFile(`${project.name}.pdf`, "application/pdf", pdf);
      } else {
        const html = await Workspace.print.exportHTML(programs, onProgress);
        downloadFile(`${project.name}.html`, "text/html", html);
      }
    } finally {
      inFlight.current = false;
      setRunning(null);
      setPercent(0);
    }
  };

  return (
    <>
      <p data-screenplay-summary class="mt-3 mb-0 min-h-0 text-body text-ink">
        {screenplaySummary(projectSettings)}
      </p>
      <Button asChild variant="quiet" class="mt-1.5 -ml-3">
        <a href="#project?section=screenplay-settings">
          Screenplay settings
          <ArrowIcon />
        </a>
      </Button>
      <div class="mt-[18px] flex flex-wrap gap-2.5">
        <Button disabled={running !== null} onClick={() => void runExport("pdf")}>
          <DownloadIcon />
          Download PDF
        </Button>
        <Button disabled={running !== null} onClick={() => void runExport("html")}>
          <DownloadIcon />
          Download HTML
        </Button>
      </div>
      {running && (
        <div
          role="progressbar"
          aria-label={`Exporting ${running.toUpperCase()}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          class="mt-3.5 h-1 w-full overflow-hidden rounded-full bg-elevated"
        >
          <div
            class="h-full origin-left bg-accent motion-safe:transition-transform motion-safe:duration-100"
            style={{ transform: `scaleX(${percent / 100})` }}
          />
        </div>
      )}
    </>
  );
}

export default function SharePage() {
  return (
    <PageFrame
      id="share-page"
      eyebrow="Download, Collaborate & Publish"
      title="Share your story"
      line="Export a shareable game or screenplay. Collaborate with others. Publish it online."
      onBack={() => void backToStory()}
    >
      <div class="grid grid-cols-2 gap-5 phone:grid-cols-1 phone:gap-3.5">
        <FeatureCard
          icon={PlayIcon}
          title="Export a game"
          sentence="Package your game for Web, Desktop, or Mobile."
          tag="Coming soon"
        >
          <Button asChild variant="quiet" class="mt-3 -ml-3">
            <a href={MARKETPLACE_URL} target="_blank" rel="noopener noreferrer">
              <BracketsIcon />
              Open your project in VS Code
            </a>
          </Button>
        </FeatureCard>
        <FeatureCard icon={FileIcon} title="Export a screenplay" sentence="Print your story to PDF or HTML.">
          <ScreenplayExport />
        </FeatureCard>
        <FeatureCard
          icon={PeopleIcon}
          title="Make it together"
          sentence="Invite someone to collaborate with you."
          tag="Coming soon"
        />
        <FeatureCard
          icon={ShareIcon}
          title="Publish it online"
          sentence="Create a playable link you can share with others."
          tag="Coming soon"
        />
      </div>
    </PageFrame>
  );
}
