// Same package, same signature — re-export the compiler's copy rather than keep
// a second implementation that has to be fixed twice.
export {
  profile,
  setRetainProfilerEntries,
} from "../../../compiler/utils/profile";
