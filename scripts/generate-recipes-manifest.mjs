import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"]);
const PREFERRED_DIRECTORIES = ["recipes", "images", "gallery"];

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFile), "..");
const outputPath = path.join(projectRoot, "recipes-manifest.js");
const collator = new Intl.Collator("zh-Hans-CN", {
  numeric: true,
  sensitivity: "base",
});

async function main() {
  const preferredImages = [];

  for (const directory of PREFERRED_DIRECTORIES) {
    const absoluteDirectory = path.join(projectRoot, directory);
    if (await existsDirectory(absoluteDirectory)) {
      preferredImages.push(...(await walkImages(absoluteDirectory, directory)));
    }
  }

  const images = preferredImages.length > 0 ? preferredImages : await readRootImages(projectRoot);
  images.sort((left, right) => collator.compare(left, right));

  const manifest = images.map((imagePath, index) => ({
    id: index + 1,
    src: encodeURI(toPosixPath(imagePath)),
    title: deriveTitle(path.basename(imagePath)),
    fileName: path.basename(imagePath),
  }));

  const output = `window.RECIPES_MANIFEST = ${JSON.stringify(manifest, null, 2)};\n`;
  await writeFile(outputPath, output, "utf8");

  console.log(`Generated ${manifest.length} recipe entries -> ${path.relative(projectRoot, outputPath)}`);
}

async function existsDirectory(absolutePath) {
  try {
    const result = await stat(absolutePath);
    return result.isDirectory();
  } catch (error) {
    return false;
  }
}

async function walkImages(absoluteDirectory, relativeDirectory) {
  const directoryEntries = await readdir(absoluteDirectory, { withFileTypes: true });
  const collected = [];

  for (const entry of directoryEntries) {
    const absolutePath = path.join(absoluteDirectory, entry.name);
    const relativePath = path.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      collected.push(...(await walkImages(absolutePath, relativePath)));
      continue;
    }

    if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      collected.push(relativePath);
    }
  }

  return collected;
}

async function readRootImages(rootDirectory) {
  const directoryEntries = await readdir(rootDirectory, { withFileTypes: true });

  return directoryEntries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name);
}

function deriveTitle(fileName) {
  return fileName
    .replace(/\.[^.]+$/i, "")
    .replace(/@\d+w$/i, "")
    .replace(/\.(png|jpe?g|webp|avif|gif)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
