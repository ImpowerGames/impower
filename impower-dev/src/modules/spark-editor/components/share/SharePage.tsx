import {
  announce,
  BracketsIcon,
  Button,
  DownloadIcon,
  FeatureCard,
  FileIcon,
  FolderIcon,
  PageFrame,
  PeopleIcon,
  PlayIcon,
  Popover,
  PopoverAnchor,
  PopoverContent,
  ShareIcon,
} from "@impower/impower-ui/components";
import { unprintableNotice } from "@impower/sparkdown-screenplay-pdf/src/utils/unprintableNotice";
import { useRef, useState } from "preact/hooks";
import { screenplaySummary } from "../../workspace/settings/screenplaySettings";
import { useSettings } from "../../workspace/settings/useSettings";
import workspace from "../../workspace/WorkspaceStore";
import { downloadFile } from "../../utils/downloadFile";
import { downloadProjectZip } from "../../utils/downloadProjectZip";
import { settingsSectionHref } from "../settings";

const MARKETPLACE_URL = "https://marketplace.visualstudio.com/items?itemName=impowergames.vscode-sparkdown";

const COMING_SOON_ID = "share-coming-soon";

const ZIP_WORKING = "Preparing the .zip…";
const ZIP_FAILED = "Could not create the .zip. Try again.";

type ExportFormat = "pdf" | "html";

function ScreenplayExport() {
  const { projectSettings } = useSettings();
  const [running, setRunning] = useState<ExportFormat | null>(null);
  const [percent, setPercent] = useState(0);
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);

  const runExport = async (format: ExportFormat) => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setRunning(format);
    setPercent(0);
    setNotice("");
    try {
      const project = workspace.current.project;
      if (!project?.id || !project.name) {
        return;
      }
      const { Workspace } = await import("../../workspace/Workspace");
      const programs = [await Workspace.fs.readProjectScriptBundle(project.id)];
      const onProgress = (value?: { percentage?: number }) => setPercent(Math.round(value?.percentage ?? 0));
      if (format === "pdf") {
        const { pdf, unprintable } = await Workspace.print.exportPDF(programs, onProgress);
        downloadFile(`${project.name}.pdf`, "application/pdf", pdf);
        setNotice(unprintableNotice(unprintable));
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
      <p class="mt-3 mb-0 flex flex-wrap items-baseline gap-x-3 text-body text-ink">
        <span data-screenplay-summary>{screenplaySummary(projectSettings)}</span>
        <a
          href={settingsSectionHref("screenplay-settings")}
          aria-label="Change screenplay settings"
          class="whitespace-nowrap text-accent underline underline-offset-2"
        >
          Change
        </a>
      </p>
      <Popover open={notice !== ""} onOpenChange={(open) => !open && setNotice("")}>
        <PopoverAnchor asChild>
          <div class="mt-[18px] flex flex-wrap gap-2.5">
            <Button variant="primary" disabled={running !== null} onClick={() => void runExport("pdf")}>
              <DownloadIcon />
              Download PDF
            </Button>
            <Button disabled={running !== null} onClick={() => void runExport("html")}>
              <DownloadIcon />
              Download HTML
            </Button>
          </div>
        </PopoverAnchor>
        <PopoverContent side="bottom" align="start" size="panel" data-unprintable-notice class="px-4 py-3">
          <p class="m-0 text-body text-ink">{notice}</p>
        </PopoverContent>
      </Popover>
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

function ProjectExport() {
  const [zip, setZip] = useState<"idle" | "working" | "failed">("idle");

  const download = async () => {
    setZip("working");
    const done = await downloadProjectZip().catch(() => false);
    setZip(done ? "idle" : "failed");
    if (!done) {
      announce(ZIP_FAILED);
    }
  };

  return (
    <>
      <div class="mt-[18px] flex flex-wrap items-center gap-2.5 phone:flex-col phone:items-start">
        <Button variant="primary" disabled={zip === "working"} onClick={() => void download()}>
          <DownloadIcon />
          Download .zip
        </Button>
        <Button asChild variant="quiet" class="phone:-ml-3">
          <a href={MARKETPLACE_URL} target="_blank" rel="noopener noreferrer">
            <BracketsIcon />
            Open your project in VS Code
          </a>
        </Button>
      </div>
      {zip === "working" && (
        <p data-zip-status class="mt-3 mb-0 text-body text-muted">
          {ZIP_WORKING}
        </p>
      )}
      {zip === "failed" && (
        <p data-zip-status class="mt-3 mb-0 text-body text-error-strong">
          {ZIP_FAILED}
        </p>
      )}
    </>
  );
}

export default function SharePage() {
  return (
    <PageFrame id="share-page" title="Share" intro={false}>
      <div class="flex flex-col gap-5 phone:gap-3.5">
        <FeatureCard icon={FileIcon} title="Export a screenplay" sentence="Print your story to PDF or HTML.">
          <ScreenplayExport />
        </FeatureCard>
        <FeatureCard icon={FolderIcon} title="Export your project" sentence="Download every script and asset as a .zip.">
          <ProjectExport />
        </FeatureCard>
        <section aria-labelledby={COMING_SOON_ID} class="mt-3 phone:mt-2">
          <h2
            id={COMING_SOON_ID}
            class="m-0 mb-3 text-[11px]/[1.4] font-semibold tracking-[0.06em] text-muted uppercase"
          >
            Coming soon
          </h2>
          <div class="flex flex-col gap-2.5">
            <FeatureCard
              layout="row"
              icon={PlayIcon}
              title="Export a game"
              sentence="Package your game for Web, Desktop, or Mobile."
            />
            <FeatureCard
              layout="row"
              icon={PeopleIcon}
              title="Make it together"
              sentence="Invite someone to collaborate with you."
            />
            <FeatureCard
              layout="row"
              icon={ShareIcon}
              title="Publish it online"
              sentence="Create a playable link you can share with others."
            />
          </div>
        </section>
      </div>
    </PageFrame>
  );
}
