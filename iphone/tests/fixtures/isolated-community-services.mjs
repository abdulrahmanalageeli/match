// Keep native calls, report access and camera verification outside Node source tests.
export function isolateCommunityServices(source) {
  return source
    .replace("'./profileReading.ts'", JSON.stringify(new URL('../../src/community/profileReading.ts',import.meta.url).href))
    .replace("'./demoAssessmentSeeds.mjs'", JSON.stringify(new URL('../../src/community/demoAssessmentSeeds.mjs',import.meta.url).href))
    .replace("'./simulationRhythm.ts'", JSON.stringify(new URL('../../src/community/simulationRhythm.ts',import.meta.url).href))
    .replace(/import .* from ['"]\.\.\/help\/support['"];?/, "const rememberSupportDirectory=()=>{};")
    .replace(/import .* from ['"]\.\.\/launchEvents['"];?/, "const launchEvent=()=>{};")
    .replace(/import .* from ['"]\.\.\/voice\/nativeCalls['"];?/, "const ringNativePhones=async()=>{throw Error('unexpected native call')};")
    .replace(/import .* from ['"]\.\/deepCompatibilityClient['"];?/, 'const deepCompatibilitySource=()=>undefined;')
    .replace(/import .* from ['"]\.\.\/photos\/verifyPhoto['"];?/, `const captureForPhoto=()=>globalThis.__portraitHarness.capture();
      const verifyUploadedPhoto=(...args)=>globalThis.__portraitHarness.verify(...args);`);
}
