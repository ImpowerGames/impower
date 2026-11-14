import type preact from "preact";
import type { JSX } from "preact";

export type IconComponent = (
  props?: preact.SVGAttributes<SVGSVGElement>,
) => JSX.Element;

export const AccountIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"12\" cy=\"8\" r=\"3\"/><path d=\"M5 21v-2a7 7 0 0 1 14 0v2\"/>" }} />
);

export const AmbienceIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11\"/>" }} />
);

export const ArrowIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 12h16m-6-6 6 6-6 6\"/>" }} />
);

export const ArtIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"4\"/><circle cx=\"8\" cy=\"8\" r=\"1\"/><path d=\"m4 17 5-5 4 3 4-6 4 6\"/>" }} />
);

export const BackIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m10 5-7 7 7 7m-7-7h18\"/>" }} />
);

export const BookIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M12 5v16M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2z\"/>" }} />
);

export const BookmarkIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M6 3.5h12v17l-6-4.5-6 4.5z\"/>" }} />
);

export const BracketsIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M9 4H5v16h4M15 4h4v16h-4\"/>" }} />
);

export const BranchIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M5 4v9a4 4 0 0 0 4 4h10m-5-5 5 5-5 5\"/>" }} />
);

export const BreakpointIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"12\" cy=\"12\" r=\"5\" fill=\"currentColor\" stroke=\"none\"/>" }} />
);

export const BugIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<rect x=\"7\" y=\"7\" width=\"10\" height=\"14\" rx=\"5\"/><path d=\"M9 7V5a3 3 0 0 1 6 0v2M3 10h4m10 0h4M2 15h5m10 0h5M4 20l4-2m8 0 4 2M12 8v12\"/>" }} />
);

export const CharacterIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21c0-4 4-6 8-6s8 2 8 6\"/>" }} />
);

export const CheckIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m5 12 4 4L19 6\"/>" }} />
);

export const ChevronDownIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m6 9 6 6 6-6\"/>" }} />
);

export const ChevronLeftIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m15 6-6 6 6 6\"/>" }} />
);

export const ChevronIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m9 6 6 6-6 6\"/>" }} />
);

export const ChooseIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"5\" cy=\"7\" r=\"2.5\"/><circle cx=\"5\" cy=\"17\" r=\"2.5\"/><circle cx=\"5\" cy=\"7\" r=\".8\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M11 7h10M11 17h10\"/>" }} />
);

export const ClearIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6\"/>" }} />
);

export const ClockIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"12\" cy=\"12\" r=\"8\"/><path d=\"M12 8v4l3 2\"/>" }} />
);

export const CloseIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m6 6 12 12M6 18 18 6\"/>" }} />
);

export const CloudIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M7 18a5 5 0 1 1 0-10 6 6 0 0 1 11-2 6 6 0 0 1 0 12Z\"/>" }} />
);

export const CogIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37c1 .608 2.296.07 2.572-1.065z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>" }} />
);

export const ComputerIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<rect x=\"3\" y=\"4\" width=\"18\" height=\"13\" rx=\"2\"/><path d=\"M8 21h8m-4-4v4\"/>" }} />
);

export const CopyRoundedIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<rect x=\"8\" y=\"8\" width=\"12\" height=\"13\" rx=\"2\"/><path d=\"M16 8V3H3v13h5\"/>" }} />
);

export const CopyIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M9 9h12v12H9zM15 9V3H3v12h6\"/>" }} />
);

export const DedentIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M20 12H9m5-5-5 5 5 5M4 5v14\"/>" }} />
);

export const DetourIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M6 21v-7.5A4.5 4.5 0 0 1 10.5 9h9M15.75 5.25 19.5 9l-3.75 3.75\"/><path d=\"M6 9.75V3\" stroke-dasharray=\"1.5 3\"/>" }} />
);

export const DeviceIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<rect x=\"5\" y=\"2\" width=\"14\" height=\"20\" rx=\"3\"/><path d=\"M10 18h4\"/>" }} />
);

export const DialogueIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 4h16v12H9l-5 4zM8 8h8M8 12h5\"/>" }} />
);

export const DownIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m5 9 7 7 7-7\"/>" }} />
);

export const DownloadTrayIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5\"/>" }} />
);

export const DownloadIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M12 3v12m-5-5 5 5 5-5M4 21h16\"/>" }} />
);

export const DuplicateIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M9 9h12v12H9zM15 9V3H3v12h6\"/>" }} />
);

export const EllipsisIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"5\" cy=\"12\" r=\"1\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/>" }} />
);

export const ErrorIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m9 9 6 6m0-6-6 6\"/>" }} />
);

export const ExpandInsetIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5\"/>" }} />
);

export const ExpandIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6\"/>" }} />
);

export const FaceIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M8 10h.01M16 10h.01M8 15s4 4 8 0\"/>" }} />
);

export const FastForwardIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m13 6 8 6-8 6zM3 6l8 6-8 6z\" fill=\"currentColor\" stroke=\"none\"/>" }} />
);

export const FileIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M5 2h10l4 4v16H5zM14 2v6h5M8 12h8M8 16h8\"/>" }} />
);

export const FilterIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 5h16l-6 7v6l-4 2v-8z\"/>" }} />
);

export const FolderPlusIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M3 7V5h7l2 2h9v13H3zM12 10v6m-3-3h6\"/>" }} />
);

export const FolderIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M3 7V5h7l2 2h9v13H3z\"/>" }} />
);

export const FollowOffIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"m4 4 16 16\"/>" }} />
);

export const FollowIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/>" }} />
);

export const FontIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M5 20 12 4l7 16M8 14h8\"/>" }} />
);

export const FormatIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 6h16M4 12h11M4 18h14\"/>" }} />
);

export const GridIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/>" }} />
);

export const HelpIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2m0 4h.01\"/>" }} />
);

export const ImageIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"4\"/><circle cx=\"8\" cy=\"8\" r=\"1\"/><path d=\"m4 17 5-5 4 3 4-6 4 6\"/>" }} />
);

export const IndentIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 12h11m-5-5 5 5-5 5M20 5v14\"/>" }} />
);

export const InfoStemIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v6m0-10h.01\"/>" }} />
);

export const InfoIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 8h.01M11 12h1v4h1\"/>" }} />
);

export const InsertIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 12h16m-6-6 6 6-6 6\"/>" }} />
);

export const InterfaceIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"3\"/><path d=\"M7 15h6M7 11h10\"/>" }} />
);

export const KeyboardIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<rect x=\"2\" y=\"5\" width=\"20\" height=\"14\" rx=\"3\"/><path d=\"M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M7 16h10\"/>" }} />
);

export const LayersIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m12 4 8 4-8 4-8-4z\"/><path d=\"m4 12 8 4 8-4M4 16l8 4 8-4\"/>" }} />
);

export const LinkIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1.5 1.5M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1.5-1.5\"/>" }} />
);

export const ListIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 6h16M4 12h16M4 18h16\"/>" }} />
);

export const LoopIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m17 2 4 4-4 4\"/><path d=\"M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4\"/><path d=\"M21 13v2a3 3 0 0 1-3 3H3\"/>" }} />
);

export const MenuIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 6h16M4 12h16M4 18h16\"/>" }} />
);

export const MinusIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 12h16\"/>" }} />
);

export const MoreVerticalIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"12\" cy=\"5\" r=\"1\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"12\" cy=\"19\" r=\"1\"/>" }} />
);

export const MoreIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"5\" cy=\"12\" r=\"1\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/>" }} />
);

export const MusicIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M9 18V6l10-2v12M9 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM19 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0z\"/>" }} />
);

export const NextIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m6 5 10 7-10 7z\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M19 5v14\"/>" }} />
);

export const OpenIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M14 4h6v6M20 4l-9 9M18 13v6H5V6h6\"/>" }} />
);

export const OtherIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M5 2h10l4 4v16H5zM14 2v6h5\"/>" }} />
);

export const PauseFillIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<rect x=\"6\" y=\"5\" width=\"4\" height=\"14\" rx=\"1\" fill=\"currentColor\" stroke=\"none\"/><rect x=\"14\" y=\"5\" width=\"4\" height=\"14\" rx=\"1\" fill=\"currentColor\" stroke=\"none\"/>" }} />
);

export const PauseOutlineIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<rect x=\"6\" y=\"5\" width=\"4\" height=\"14\" rx=\"1\"/><rect x=\"14\" y=\"5\" width=\"4\" height=\"14\" rx=\"1\"/>" }} />
);

export const PauseIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M8 5v14M16 5v14\" stroke-width=\"4\"/>" }} />
);

export const PencilPlainIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m4 16 12-12 4 4L8 20H4zM14 6l4 4\"/>" }} />
);

export const PencilIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m15 4 5 5M4 20l5-1L20 8a3.54 3.54 0 0 0-5-5L4 14zM4 14l5 5\"/>" }} />
);

export const PeopleIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"9\" cy=\"8\" r=\"3\"/><path d=\"M3 20v-3a6 6 0 0 1 12 0v3m1-15a3 3 0 0 1 0 6m3 9v-3a5 5 0 0 0-3-4\"/>" }} />
);

export const PinFillIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M9 3v6l-3 3v2h12v-2l-3-3V3z\" fill=\"currentColor\"/><path d=\"M8 3h8M9 3v6l-3 3v2h12v-2l-3-3V3M12 14v7\"/>" }} />
);

export const PinIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M8 3h8M9 3v6l-3 3v2h12v-2l-3-3V3M12 14v7\"/>" }} />
);

export const PipetteIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M11.75 6.75l5.5 5.5M12.5 7.5l3-3a2.83 2.83 0 0 1 4 4l-3 3M13.25 8.25l-7.5 7.5L4 20l4.25-1.75 7.5-7.5\"/>" }} />
);

export const PlaceIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m3 19 6-10 4 6 2-3 6 7z\"/><circle cx=\"17\" cy=\"7\" r=\"2\"/>" }} />
);

export const PlayOutlineIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M7 5v14l12-7z\"/>" }} />
);

export const PlayIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m8 4 12 8-12 8z\" fill=\"currentColor\" stroke=\"none\"/>" }} />
);

export const PlusIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M12 4v16M4 12h16\"/>" }} />
);

export const PreviousIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m18 5-10 7 10 7z\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M5 5v14\"/>" }} />
);

export const RatioIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M7 12V9h4m6 3v3h-4\"/>" }} />
);

export const RedoIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m16 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12\"/>" }} />
);

export const RefreshIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16m0 4v-4h-4\"/>" }} />
);

export const ReplaceAllIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M5 3v4a2 2 0 0 0 2 2h12m-3-3 3 3-3 3M5 13v4a2 2 0 0 0 2 2h12m-3-3 3 3-3 3\"/>" }} />
);

export const ReplaceSwapIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 8h13l-3-3M20 16H7l3 3\"/>" }} />
);

export const ReplaceIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M6 4v9a3 3 0 0 0 3 3h9m0 0-3-3m3 3-3 3\"/>" }} />
);

export const RestartIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 4v6h6\"/><path d=\"M4.6 14a8 8 0 1 0 1.8-8.1L4 10\"/>" }} />
);

export const ResumeIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m7 5 12 7-12 7z\" fill=\"currentColor\" stroke=\"none\"/>" }} />
);

export const RewindIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M11 6 3 12l8 6zM21 6l-8 6 8 6z\" fill=\"currentColor\" stroke=\"none\"/>" }} />
);

export const RootIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M3 3h7l2 2h9v16H3zM7 10h10M7 14h6\"/>" }} />
);

export const SaveIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7\"/>" }} />
);

export const SceneIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<g transform=\"translate(1.2 1.2) scale(.9)\"><path d=\"M3.2 11 20 6.2l-.9-3.1a1.5 1.5 0 0 0-1.9-1L3.6 6.1a1.5 1.5 0 0 0-1 1.9z\"/><path d=\"m7 5.5 2.5 3.6M12.2 4l2.5 3.6\"/><path d=\"M3 11h18v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5z\"/></g>" }} />
);

export const ScissorsIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"6.75\" cy=\"17.25\" r=\"3\"/><circle cx=\"17.25\" cy=\"17.25\" r=\"3\"/><path d=\"M8.7 15 18 3.75M15.3 15 6 3.75\"/>" }} />
);

export const ScreenplayIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M6 3h8l4 4v14H6z\"/><path d=\"M14 3v4h4M10.5 11h3M9 14h6M9 17h6\"/>" }} />
);

export const SearchIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"10\" cy=\"10\" r=\"6\"/><path d=\"m15 15 6 6\"/>" }} />
);

export const SelectIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"4\"/><path d=\"m8 12 3 3 5-6\"/>" }} />
);

export const SettingsIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 7h16M4 17h16\"/><circle cx=\"9\" cy=\"7\" r=\"3\" fill=\"var(--panel)\"/><circle cx=\"16\" cy=\"17\" r=\"3\" fill=\"var(--panel)\"/>" }} />
);

export const ShareIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M12 16V3m-5 5 5-5 5 5M4 13v7h16v-7\"/>" }} />
);

export const ShrinkIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M3 9h6V3m12 6h-6V3M3 15h6v6m12-6h-6v6\"/>" }} />
);

export const SignOutIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M10 4H5v16h5m4-12 4 4-4 4m4-4H9\"/>" }} />
);

export const SizeIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<rect x=\"3\" y=\"8\" width=\"18\" height=\"8\" rx=\"1\"/><path d=\"M7 8v3M11 8v3M15 8v3\"/>" }} />
);

export const SortReverseIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M7 20V4m-4 4 4-4 4 4M14 5h3M14 10h5M14 15h7\"/>" }} />
);

export const SortIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M7 4v16m-4-4 4 4 4-4M14 5h7M14 10h5M14 15h3\"/>" }} />
);

export const SoundSpeakerIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6\"/>" }} />
);

export const SoundIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M10 4v12a3 3 0 1 1-3-3m3-9 10-2v12a3 3 0 1 1-3-3M10 8l10-2\"/>" }} />
);

export const SparkIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M14 2 5 13h7l-2 9 9-13h-7z\" fill=\"currentColor\" stroke=\"none\"/>" }} />
);

export const StepIntoIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M12 3v10m-4-4 4 4 4-4\"/><circle cx=\"12\" cy=\"19\" r=\"2\" fill=\"currentColor\" stroke=\"none\"/>" }} />
);

export const StepOutIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M12 14V4m-4 4 4-4 4 4\"/><circle cx=\"12\" cy=\"19\" r=\"2\" fill=\"currentColor\" stroke=\"none\"/>" }} />
);

export const StepOverIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M5 14a7 7 0 0 1 14 0m-3-3 3 3 3-3\"/><circle cx=\"12\" cy=\"19\" r=\"2\" fill=\"currentColor\" stroke=\"none\"/>" }} />
);

export const StopSignIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M8.6 3.7h6.8l4.9 4.9v6.8l-4.9 4.9H8.6l-4.9-4.9V8.6z\"/>" }} />
);

export const StopIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"1\" fill=\"currentColor\" stroke=\"none\"/>" }} />
);

export const StoryIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M12 5v16M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2z\"/>" }} />
);

export const TargetIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"12\" cy=\"12\" r=\"8\"/><circle cx=\"12\" cy=\"12\" r=\"2.5\" fill=\"currentColor\" stroke=\"none\"/>" }} />
);

export const TextLinesIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 5h16M4 9.5h16M4 14h11M4 18.5h7\"/>" }} />
);

export const TextIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M5 2h10l4 4v16H5zM14 2v6h5M8 12h8M8 16h8\"/>" }} />
);

export const TrashIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7\"/>" }} />
);

export const UndoIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m8 5-5 5 5 5M3 10h11a6 6 0 0 1 0 12\"/>" }} />
);

export const UpIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m5 15 7-7 7 7\"/>" }} />
);

export const UploadIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M12 21V9m-5 5 5-5 5 5M4 3h16\"/>" }} />
);

export const UsesIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1\"/>" }} />
);

export const VariantsIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M2 12c3-5 6-7 10-7s7 2 10 7c-3 5-6 7-10 7s-7-2-10-7z\"/>" }} />
);

export const VideoIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M3 6h13v12H3zM16 10l5-3v10l-5-3\"/>" }} />
);

export const VisualIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<rect x=\"3\" y=\"4\" width=\"18\" height=\"15\" rx=\"2\"/><path d=\"m3 15 5-5 4 4 3-3 6 6\"/><circle cx=\"16.5\" cy=\"9\" r=\"1.5\"/>" }} />
);

export const VolumeIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"M4 9h4l5-5v16l-5-5H4zM17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14\"/>" }} />
);

export const WarningIcon: IconComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" {...props} dangerouslySetInnerHTML={{ __html: "<path d=\"m12 3 10 18H2zM12 9v5m0 3h.01\"/>" }} />
);
