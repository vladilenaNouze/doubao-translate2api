import { spawn, execFile } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

// Pick a free local port, then exercise the compiled production entrypoint.
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const env = {
  ...process.env, API_KEY: randomUUID(), ALLOW_NO_AUTH: "false",
  HOST: "127.0.0.1", PORT: String(port), LOG_LEVEL: "silent",
  ADMIN_ENABLED: "false",
  SMOKE_BASE_URL: `http://127.0.0.1:${port}`, LIVE_TRANSLATION: "false",
};
delete env.API_KEYS;
const child = spawn(process.execPath, ["dist/server.js"], { env, stdio: ["ignore", "pipe", "pipe"] });
const exited = new Promise(resolve => child.once("exit", resolve));
let output = "";
child.stdout.on("data", data => { output += data; });
child.stderr.on("data", data => { output += data; });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error("Production entrypoint exited before startup.");
    try {
      const response = await fetch(env.SMOKE_BASE_URL + "/health");
      await response.text();
      if (response.ok) { ready = true; break; }
    } catch { /* Wait for the child to bind the port. */ }
    await delay(50);
  }
  if (!ready) throw new Error("Production entrypoint startup timed out.");
  const result = await promisify(execFile)("sh", ["scripts/smoke.sh"], { env });
  process.stdout.write(result.stdout);
  console.log("Compiled server smoke passed.");
} catch (error) {
  process.stderr.write(output);
  throw error;
} finally {
  child.kill("SIGTERM");
  const force = setTimeout(() => child.kill("SIGKILL"), 11000);
  await exited;
  clearTimeout(force);
}
