import {
  copyFile,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultProjectRoot = path.resolve(path.dirname(scriptPath), "..");
const filesToCopy = ["manifest.json", "sidepanel.html", "sidepanel.css"];
const directoriesToCopy = ["src", "assets"];

export async function buildExtension({
  projectRoot = defaultProjectRoot,
  outputDirectory = path.join(projectRoot, "dist"),
} = {}) {
  const stagingDirectory = await mkdtemp(path.join(os.tmpdir(), "pageport-build-"));

  try {
    await stageExtension(projectRoot, stagingDirectory);
    await validateExtension(stagingDirectory);
    await publishExtension(stagingDirectory, outputDirectory);
    await validateExtension(outputDirectory);
    return outputDirectory;
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

async function stageExtension(projectRoot, stagingDirectory) {
  for (const file of filesToCopy) {
    await cp(path.join(projectRoot, file), path.join(stagingDirectory, file));
  }

  for (const directory of directoriesToCopy) {
    await cp(path.join(projectRoot, directory), path.join(stagingDirectory, directory), { recursive: true });
  }
}

async function validateExtension(directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const requiredFiles = [
    manifest.background?.service_worker,
    manifest.side_panel?.default_path,
    ...Object.values(manifest.icons ?? {}),
  ];

  if (requiredFiles.some((file) => typeof file !== "string" || !file.trim())) {
    throw new Error("The extension manifest is missing a required entry point or icon.");
  }

  for (const file of requiredFiles) {
    await readFile(path.join(directory, file));
  }
}

async function publishExtension(stagingDirectory, outputDirectory) {
  // Keep this directory in place: unpacked extension identity is tied to its loaded path.
  await mkdir(outputDirectory, { recursive: true });
  await ensureStagedDirectories(stagingDirectory, outputDirectory);

  const stagedFiles = await listFiles(stagingDirectory);
  stagedFiles.sort((left, right) => {
    if (left === "manifest.json") return 1;
    if (right === "manifest.json") return -1;
    return left.localeCompare(right);
  });

  for (const relativePath of stagedFiles) {
    const source = path.join(stagingDirectory, relativePath);
    const destination = path.join(outputDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await replaceFile(source, destination);
  }

  // Publish the manifest last so it never points at files that have not been copied yet.
  await removeStaleEntries(stagingDirectory, outputDirectory);
}

async function ensureStagedDirectories(stagingDirectory, outputDirectory, relativeDirectory = "") {
  const sourceDirectory = path.join(stagingDirectory, relativeDirectory);
  const destinationDirectory = path.join(outputDirectory, relativeDirectory);
  await ensureDirectory(destinationDirectory);

  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await ensureStagedDirectories(stagingDirectory, outputDirectory, path.join(relativeDirectory, entry.name));
    }
  }
}

async function ensureDirectory(directory) {
  try {
    const details = await lstat(directory);
    if (!details.isDirectory()) await rm(directory, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(directory, { recursive: true });
}

async function replaceFile(source, destination) {
  const temporaryFile = `${destination}.pageport-${process.pid}.tmp`;
  try {
    try {
      const details = await lstat(destination);
      if (details.isDirectory()) await rm(destination, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    await copyFile(source, temporaryFile);
    await rename(temporaryFile, destination);
  } finally {
    await rm(temporaryFile, { force: true });
  }
}

async function listFiles(directory, relativeDirectory = "") {
  const files = [];
  const entries = await readdir(path.join(directory, relativeDirectory), { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(directory, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

async function removeStaleEntries(stagingDirectory, outputDirectory, relativeDirectory = "") {
  const sourceDirectory = path.join(stagingDirectory, relativeDirectory);
  const destinationDirectory = path.join(outputDirectory, relativeDirectory);
  const sourceEntries = await readdir(sourceDirectory, { withFileTypes: true });
  const expectedNames = new Set(sourceEntries.map((entry) => entry.name));
  const destinationEntries = await readdir(destinationDirectory, { withFileTypes: true });

  for (const entry of destinationEntries) {
    const destination = path.join(destinationDirectory, entry.name);
    if (!expectedNames.has(entry.name)) {
      await rm(destination, { recursive: true, force: true });
      continue;
    }

    const source = sourceEntries.find((candidate) => candidate.name === entry.name);
    if (source.isDirectory() && entry.isDirectory()) {
      await removeStaleEntries(stagingDirectory, outputDirectory, path.join(relativeDirectory, entry.name));
    } else if (source.isDirectory() !== entry.isDirectory()) {
      await rm(destination, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  buildExtension()
    .then((outputDirectory) => process.stdout.write(`Built Pageport extension at ${outputDirectory}\n`))
    .catch((error) => {
      process.stderr.write(`Pageport build failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}
