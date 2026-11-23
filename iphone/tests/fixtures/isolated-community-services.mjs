// Keep native calls, report access and camera verification outside Node source tests.
export function isolateCommunityServices(source) {
  return source
    .replace(/import .* from ['"]\.\.\/help\/support['"];?/, "const rememberSupportDirectory=()=>{};")
    .replace(/import .* from ['"]\.\.\/launchEvents['"];?/, "const launchEvent=()=>{};")
    .replace(/import .* from ['"]\.\.\/voice\/nativeCalls['"];?/, "const ringNativePhones=async()=>{throw Error('unexpected native call')};")
    .replace(/import .* from ['"]\.\/deepCompatibilityClient['"];?/, 'const deepCompatibilitySource=()=>undefined;')
    .replace(/import .* from ['"]\.\.\/photos\/verifyPhoto['"];?/, `const captureForPhoto=()=>globalThis.__portraitHarness.capture();
      const verifyUploadedPhoto=(...args)=>globalThis.__portraitHarness.verify(...args);`);
}
