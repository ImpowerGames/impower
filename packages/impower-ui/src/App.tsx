import Button from "./components/button/Button";
import { buttonGallery } from "./components/button/Button.gallery";
import { dialogGallery } from "./components/dialog/Dialog.gallery";
import { dropdownGallery } from "./components/dropdown/Dropdown.gallery";
import { iconGallery } from "./components/icon/Icon.gallery";
import { madeWithSparkSplashGallery } from "./components/made-with-spark-splash/MadeWithSparkSplash.gallery";
import { sparkLogoGallery } from "./components/spark-logo/SparkLogo.gallery";
import { loadingBarGallery } from "./components/loading-bar/LoadingBar.gallery";
import { routerGallery } from "./components/router/Router.gallery";
import { sidebarLayoutGallery } from "./components/sidebar-layout/SidebarLayout.gallery";
import { splitPaneGallery } from "./components/split-pane/SplitPane.gallery";
import { tabsGallery } from "./components/tabs/Tabs.gallery";
import { toastGallery } from "./components/toast/Toast.gallery";
import { GallerySection, type GalleryEntry } from "./gallery/GallerySection";

export const galleryEntries: readonly GalleryEntry[] = [
  buttonGallery,
  dialogGallery,
  dropdownGallery,
  iconGallery,
  loadingBarGallery,
  madeWithSparkSplashGallery,
  sparkLogoGallery,
  routerGallery,
  sidebarLayoutGallery,
  splitPaneGallery,
  tabsGallery,
  toastGallery,
];

export function App() {
  return (
    <div class="min-h-screen w-full bg-bg p-8 font-sans text-ink">
      <header class="mb-6">
        <h1 class="mb-1 text-2xl font-semibold">@impower/impower-ui</h1>
        <p class="text-sm text-muted">
          Gallery: every exported component in every variant, size and state.
        </p>
        <nav class="mt-3 flex flex-wrap gap-3 text-sm">
          {galleryEntries.map((entry) => (
            <Button key={entry.title} asChild variant="quiet">
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
