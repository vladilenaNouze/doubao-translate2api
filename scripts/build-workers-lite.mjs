import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";

const result = await build({
  entryPoints: ["src/workers-lite/index.ts"],
  outfile: ".artifacts/workers-lite/worker.js",
  bundle: true, format: "esm", platform: "browser", target: "es2023",
  minify: true, legalComments: "none", write: false, metafile: true,
});
const files = result.outputFiles;
if (files.length !== 1 || Object.keys(result.metafile.inputs).length !== 1 ||
    Object.values(result.metafile.outputs).some(output => output.imports.length))
  throw new Error("Lite must produce one self-contained JavaScript file.");
const bytes = files[0].contents.byteLength;
if (bytes > 32_000) throw new Error(`Lite is ${bytes} bytes; the limit is 32,000.`);
await mkdir(".artifacts/workers-lite", { recursive: true });
await writeFile(files[0].path, files[0].contents);
console.log(`Single file: ${files[0].path}\nJavaScript: ${bytes} / 32000 bytes; gzip: ${gzipSync(files[0].contents).byteLength} bytes`);
