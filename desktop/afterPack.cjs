// Ad-hoc code-sign the macOS app after packing. Without a Developer ID we can't
// notarize, but an *unsigned* arm64 app is reported as "damaged" and won't open
// on Apple Silicon. An ad-hoc signature (`codesign -s -`) makes it launchable via
// the normal Gatekeeper bypass (right-click → Open). No-op on Windows/Linux.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  // For a universal build, electron-builder packs each arch into a "*-temp"
  // folder and lipo-merges them; that merge requires identical signatures, so
  // signing the temps breaks it. Sign only the final (merged) app.
  if (context.appOutDir.endsWith("-temp")) return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`afterPack: ad-hoc signing ${appPath}`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
};
