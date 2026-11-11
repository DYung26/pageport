import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "dist");
const filesToCopy = ["manifest.json", "sidepanel.html", "sidepanel.css"];
const directoriesToCopy = ["src", "assets"];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const file of filesToCopy) {
  await cp(path.join(projectRoot, file), path.join(outputDirectory, file));
}

for (const directory of directoriesToCopy) {
  await cp(path.join(projectRoot, directory), path.join(outputDirectory, directory), { recursive: true });
}

const manifest = JSON.parse(await readFile(path.join(outputDirectory, "manifest.json"), "utf8"));
const requiredFiles = [
  manifest.background.service_worker,
  manifest.side_panel.default_path,
  ...Object.values(manifest.icons ?? {}),
];

for (const file of requiredFiles) {
  await readFile(path.join(outputDirectory, file));
}

process.stdout.write(`Built Pageport extension at ${outputDirectory}\n`);
