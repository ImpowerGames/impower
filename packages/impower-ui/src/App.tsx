import Button from "./components/button/Button";
import { buttonGallery } from "./components/button/Button.gallery";
import { dialogGallery } from "./components/dialog/Dialog.gallery";
import { dropdownGallery } from "./components/dropdown/Dropdown.gallery";
import { iconGallery } from "./components/icon/Icon.gallery";
import { sparkLogoGallery } from "./components/spark-logo/SparkLogo.gallery";
import { loadingBarGallery } from "./components/loading-bar/LoadingBar.gallery";
import { rippleGallery } from "./components/ripple/Ripple.gallery";
import { routerGallery } from "./components/router/Router.gallery";
import { splitPaneGallery } from "./components/split-pane/SplitPane.gallery";
import { tabsGallery } from "./components/tabs/Tabs.gallery";
import { GallerySection, type GalleryEntry } from "./gallery/GallerySection";

export const galleryEntries: readonly GalleryEntry[] = [
  buttonGallery,
  dialogGallery,
  dropdownGallery,
  iconGallery,
  loadingBarGallery,
  sparkLogoGallery,
  rippleGallery,
  routerGallery,
  splitPaneGallery,
  tabsGallery,
];

export function App() {
  return (
    <div class="min-h-screen w-full bg-background p-8 font-sans text-foreground">
      <header class="mb-6">
        <h1 class="mb-1 text-2xl font-semibold">@impower/impower-ui</h1>
        <p class="text-sm text-foreground/60">
          Gallery: every exported component in every variant, size and state.
        </p>
        <nav class="mt-3 flex flex-wrap gap-3 text-sm">
          {galleryEntries.map((entry) => (
            <Button key={entry.title} asChild variant="link">
              <a href={`#${entry.title}`}>{entry.title}</a>
            </Button>
          ))}
        </nav>
      </header>
      <div class="space-y-12">
        {galleryEntries.map((entry) => (
          <GallerySection key={entry.title} entry={entry} />
        ))}
      </div>
    </div>
  );
}
