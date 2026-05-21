import transformer from "../../../../packages/sparkle-style-transformer/src/index";
import sparklePatternsCSS from "../../../../packages/sparkle/src/styles/patterns/patterns.css";
import { ComponentSpec } from "../../../../packages/spec-component/src/spec";
import baseNormalize from "../../../../packages/spec-component/src/styles/normalize/normalize.css";
import Account from "./components/account/_account";
import Demo from "./components/demo/_demo";
import FileEditorNavigation from "./components/file-editor-navigation/_file-editor-navigation";
import HeaderMenuButton from "./components/header-menu-button/_header-menu-button";
import HeaderNavigationPlaceholder from "./components/header-navigation-placeholder/_header-navigation-placeholder";
import HeaderSyncConflictToolbar from "./components/header-sync-conflict-toolbar/_header-sync-conflict-toolbar";
import HeaderSyncToolbar from "./components/header-sync-toolbar/_header-sync-toolbar";
import HeaderTitleButton from "./components/header-title-button/_header-title-button";
import HeaderTitleCaption from "./components/header-title-caption/_header-title-caption";
import OptionButton from "./components/option-button/_option-button";
import Scrollable from "./components/scrollable/_scrollable";
import editorNormalize from "./styles/normalize/normalize.css";
import editorTheme from "./styles/theme/theme.css";

const config = {
  patterns: [sparklePatternsCSS],
};

const style = <
  Props extends Record<string, unknown> = Record<string, unknown>,
  Stores extends Record<string, any> = Record<string, any>,
  Context extends Record<string, unknown> = Record<string, unknown>,
  Graphics extends Record<string, string> = Record<string, string>,
  Selectors extends Record<string, null | string | string[]> = Record<
    string,
    null | string | string[]
  >,
>(
  spec: ComponentSpec<Props, Stores, Context, Graphics, Selectors>,
): ComponentSpec<Props, Stores, Context, Graphics, Selectors> => {
  return {
    ...spec,
    html: (args) => {
      const content = spec.html(args);
      return transformer(content, config);
    },
  };
};

const components = [
  { tag: "", css: baseNormalize },
  { tag: "", css: editorNormalize },
  { tag: "", css: editorTheme },
  style(Scrollable),
  style(OptionButton),
  style(FileEditorNavigation),
  style(Account),
  style(HeaderSyncConflictToolbar),
  style(HeaderSyncToolbar),
  style(HeaderMenuButton),
  style(HeaderTitleButton),
  style(HeaderTitleCaption),
  style(HeaderNavigationPlaceholder),
  style(Demo),
] as const;

export default components;
