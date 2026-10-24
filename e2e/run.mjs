import { spawn } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, ".out");
mkdirSync(out, { recursive: true });

const only = process.argv.slice(2);
const suites = readdirSync(join(here, "suites"))
  .filter((file) => file.endsWith(".mjs"))
  .filter((file) => only.length === 0 || only.some((name) => file.includes(name)))
  .sort();

let failures = 0;
for (const suite of suites) {
  console.log(`\n=== ${suite}`);
  const code = await new Promise((resolve) => {
    const child = spawn("node", [join(here, "suites", suite)], { cwd: out, stdio: ["ignore", "pipe", "inherit"], env: process.env });
    let failed = false;
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      if (text.includes("✗ FAIL")) failed = true;
      process.stdout.write(text);
    });
    child.on("close", (status) => resolve(status || (failed ? 1 : 0)));
  });
  if (code !== 0) failures++;
}
console.log(failures ? `\n${failures} of ${suites.length} suites failed` : `\nAll ${suites.length} suites passed`);
process.exit(failures ? 1 : 0);
