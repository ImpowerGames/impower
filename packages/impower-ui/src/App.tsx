import Button from "./components/button/Button";
import { actionSheetGallery } from "./components/action-sheet/ActionSheet.gallery";
import { buttonGallery } from "./components/button/Button.gallery";
import { choiceGroupGallery } from "./components/choice-group/ChoiceGroup.gallery";
import { dialogGallery } from "./components/dialog/Dialog.gallery";
import { dropdownGallery } from "./components/dropdown/Dropdown.gallery";
import { iconGallery } from "./components/icon/Icon.gallery";
import { jumpChipsGallery } from "./components/jump-chips/JumpChips.gallery";
import { keysChipGallery } from "./components/keys-chip/KeysChip.gallery";
import { listRowGallery } from "./components/list-row/ListRow.gallery";
import { liveRegionGallery } from "./components/live-region/LiveRegion.gallery";
import { madeWithSparkSplashGallery } from "./components/made-with-spark-splash/MadeWithSparkSplash.gallery";
import { sparkLogoGallery } from "./components/spark-logo/SparkLogo.gallery";
import { loadingBarGallery } from "./components/loading-bar/LoadingBar.gallery";
import { railIndexGallery } from "./components/rail-index/RailIndex.gallery";
import { routerGallery } from "./components/router/Router.gallery";
import { selectGallery } from "./components/select/Select.gallery";
import { settingsGallery } from "./components/settings/Settings.gallery";
import { sidebarLayoutGallery } from "./components/sidebar-layout/SidebarLayout.gallery";
import { splitPaneGallery } from "./components/split-pane/SplitPane.gallery";
import { switchGallery } from "./components/switch/Switch.gallery";
import { tabsGallery } from "./components/tabs/Tabs.gallery";
import { textFieldGallery } from "./components/text-field/TextField.gallery";
import { themeSwatchGallery } from "./components/theme-swatch/ThemeSwatch.gallery";
import { toastGallery } from "./components/toast/Toast.gallery";
import { virtualListGallery } from "./components/virtual-list/VirtualList.gallery";
import { GallerySection, type GalleryEntry } from "./gallery/GallerySection";

export const galleryEntries: readonly GalleryEntry[] = [
  actionSheetGallery,
  buttonGallery,
  choiceGroupGallery,
  dialogGallery,
  dropdownGallery,
  iconGallery,
  jumpChipsGallery,
  keysChipGallery,
  listRowGallery,
  liveRegionGallery,
  loadingBarGallery,
  madeWithSparkSplashGallery,
  sparkLogoGallery,
  railIndexGallery,
  routerGallery,
  selectGallery,
  settingsGallery,
  sidebarLayoutGallery,
  splitPaneGallery,
  switchGallery,
  tabsGallery,
  textFieldGallery,
  themeSwatchGallery,
  toastGallery,
  virtualListGallery,
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
