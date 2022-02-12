/// To make it possible to group extensions together into bigger
/// extensions (such as the [Github-flavored Markdown](#GFM)
/// extension), [reconfiguration](#MarkdownParser.configure) accepts

import { MarkdownConfig } from "./markdownConfig";

/// nested arrays of [config](#MarkdownConfig) objects.
export type MarkdownExtension = MarkdownConfig | readonly MarkdownExtension[];
