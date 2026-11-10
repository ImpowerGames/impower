import Button from "./components/button/Button";
import { actionSheetGallery } from "./components/action-sheet/ActionSheet.gallery";
import { buttonGallery } from "./components/button/Button.gallery";
import { choiceGroupGallery } from "./components/choice-group/ChoiceGroup.gallery";
import { colorChipsGallery } from "./components/color-chips/ColorChips.gallery";
import { colorWellGallery } from "./components/color-well/ColorWell.gallery";
import { disclosureGallery } from "./components/disclosure/Disclosure.gallery";
import { dialogGallery } from "./components/dialog/Dialog.gallery";
import { dropdownGallery } from "./components/dropdown/Dropdown.gallery";
import { filterChipGallery } from "./components/filter-chip/FilterChip.gallery";
import { featureCardGallery } from "./components/feature-card/FeatureCard.gallery";
import { iconGallery } from "./components/icon/Icon.gallery";
import { jumpChipsGallery } from "./components/jump-chips/JumpChips.gallery";
import { keysChipGallery } from "./components/keys-chip/KeysChip.gallery";
import { listRowGallery } from "./components/list-row/ListRow.gallery";
import { liveRegionGallery } from "./components/live-region/LiveRegion.gallery";
import { messageEntryGallery } from "./components/message-entry/MessageEntry.gallery";
import { panelCardGallery } from "./components/panel-card/PanelCard.gallery";
import { madeWithSparkSplashGallery } from "./components/made-with-spark-splash/MadeWithSparkSplash.gallery";
import { sparkLogoGallery } from "./components/spark-logo/SparkLogo.gallery";
import { loadingBarGallery } from "./components/loading-bar/LoadingBar.gallery";
import { pageFrameGallery } from "./components/page-frame/PageFrame.gallery";
import { popoverGallery } from "./components/popover/Popover.gallery";
import { railIndexGallery } from "./components/rail-index/RailIndex.gallery";
import { routerGallery } from "./components/router/Router.gallery";
import { portraitThumbnailGallery } from "./components/portrait-thumbnail/PortraitThumbnail.gallery";
import { selectGallery } from "./components/select/Select.gallery";
import { settingsGallery } from "./components/settings/Settings.gallery";
import { sliderGallery } from "./components/slider/Slider.gallery";
import { sidebarLayoutGallery } from "./components/sidebar-layout/SidebarLayout.gallery";
import { splitPaneGallery } from "./components/split-pane/SplitPane.gallery";
import { switchGallery } from "./components/switch/Switch.gallery";
import { tabbedPageGallery } from "./components/tabbed-page/TabbedPage.gallery";
import { tabsGallery } from "./components/tabs/Tabs.gallery";
import { textFieldGallery } from "./components/text-field/TextField.gallery";
import { themeSwatchGallery } from "./components/theme-swatch/ThemeSwatch.gallery";
import { toastGallery } from "./components/toast/Toast.gallery";
import { treeToggleGallery } from "./components/tree-toggle/TreeToggle.gallery";
import { virtualListGallery } from "./components/virtual-list/VirtualList.gallery";
import { thumbnailGallery } from "./components/thumbnail/Thumbnail.gallery";
import { folderCoverGallery } from "./components/folder-cover/FolderCover.gallery";
import { variantsChipGallery } from "./components/variants-chip/VariantsChip.gallery";
import { variantsBadgeGallery } from "./components/variants-badge/VariantsBadge.gallery";
import { tileGallery } from "./components/tile/Tile.gallery";
import { GallerySection, type GalleryEntry } from "./gallery/GallerySection";

export const galleryEntries: readonly GalleryEntry[] = [
  actionSheetGallery,
  buttonGallery,
  choiceGroupGallery,
  colorChipsGallery,
  colorWellGallery,
  dialogGallery,
  disclosureGallery,
  dropdownGallery,
  filterChipGallery,
  featureCardGallery,
  iconGallery,
  jumpChipsGallery,
  keysChipGallery,
  listRowGallery,
  liveRegionGallery,
  loadingBarGallery,
  madeWithSparkSplashGallery,
  messageEntryGallery,
  panelCardGallery,
  sparkLogoGallery,
  pageFrameGallery,
  popoverGallery,
  railIndexGallery,
  routerGallery,
  portraitThumbnailGallery,
  selectGallery,
  settingsGallery,
  sidebarLayoutGallery,
  sliderGallery,
  splitPaneGallery,
  switchGallery,
  tabbedPageGallery,
  tabsGallery,
  textFieldGallery,
  themeSwatchGallery,
  toastGallery,
  treeToggleGallery,
  virtualListGallery,
  thumbnailGallery,
  folderCoverGallery,
  variantsChipGallery,
  variantsBadgeGallery,
  tileGallery,
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
