/** Native passes CFBundleVersion. Web releases can set their monotonically increasing build number in Vite. */
export function publicationBuild(nativeBuild?:string) {
  const value=Number(nativeBuild ?? import.meta.env.VITE_WUDAYN_WEB_BUILD ?? 1);
  return Number.isSafeInteger(value) && value>=1 && value<=999999 ? value : 1;
}
