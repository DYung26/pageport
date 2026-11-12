import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildExtension } from "../scripts/build.mjs";

async function createProjectFixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "pageport-build-test-"));
  const outputDirectory = path.join(projectRoot, "dist");
  await mkdir(path.join(projectRoot, "src"), { recursive: true });
  await mkdir(path.join(projectRoot, "assets"), { recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(projectRoot, "manifest.json"), JSON.stringify({
    background: { service_worker: "src/background.js" },
    side_panel: { default_path: "sidepanel.html" },
    icons: { 16: "assets/icon16.png" },
  }));
  await writeFile(path.join(projectRoot, "sidepanel.html"), "<main>new panel</main>");
  await writeFile(path.join(projectRoot, "sidepanel.css"), "body { color: white; }");
  await writeFile(path.join(projectRoot, "src/background.js"), "// new worker");
  await writeFile(path.join(projectRoot, "assets/icon16.png"), "new icon");
  return { projectRoot, outputDirectory };
}

test("publishes a new build in place without replacing the extension directory", async () => {
  const { projectRoot, outputDirectory } = await createProjectFixture();
  try {
    await writeFile(path.join(outputDirectory, "old-worker.js"), "obsolete");
    await mkdir(path.join(outputDirectory, "old-assets"));
    const before = await stat(outputDirectory);

    await buildExtension({ projectRoot, outputDirectory });

    const after = await stat(outputDirectory);
    assert.equal(after.ino, before.ino, "the installed extension directory keeps its identity");
    assert.equal(await readFile(path.join(outputDirectory, "sidepanel.html"), "utf8"), "<main>new panel</main>");
    assert.equal(await readFile(path.join(outputDirectory, "src/background.js"), "utf8"), "// new worker");
    assert.equal(await readFile(path.join(outputDirectory, "manifest.json"), "utf8"), await readFile(path.join(projectRoot, "manifest.json"), "utf8"));
    assert.deepEqual((await readdir(outputDirectory)).sort(), ["assets", "manifest.json", "sidepanel.css", "sidepanel.html", "src"]);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("leaves the installed build untouched when staging validation fails", async () => {
  const { projectRoot, outputDirectory } = await createProjectFixture();
  try {
    const marker = path.join(outputDirectory, "active-build.marker");
    await writeFile(marker, "keep this build");
    await writeFile(path.join(outputDirectory, "manifest.json"), "old manifest");
    const originalManifest = await readFile(path.join(outputDirectory, "manifest.json"), "utf8");
    await writeFile(path.join(outputDirectory, "sidepanel.html"), "old panel");
    await writeFile(path.join(projectRoot, "manifest.json"), JSON.stringify({
      background: { service_worker: "missing.js" },
      side_panel: { default_path: "sidepanel.html" },
      icons: { 16: "assets/icon16.png" },
    }));

    await assert.rejects(buildExtension({ projectRoot, outputDirectory }));

    assert.equal(await readFile(marker, "utf8"), "keep this build");
    assert.equal(await readFile(path.join(outputDirectory, "sidepanel.html"), "utf8"), "old panel");
    assert.equal(await readFile(path.join(outputDirectory, "manifest.json"), "utf8"), originalManifest);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
