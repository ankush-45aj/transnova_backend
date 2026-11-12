const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const root = path.resolve(__dirname, "..");
const ignored = new Set(["node_modules", ".git"]);
const failures = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (/\.(js|json)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, "utf8");
      if (/^(<<<<<<<|=======|>>>>>>>)/m.test(content)) failures.push(`${path.relative(root, fullPath)} contains a merge conflict marker`);
      if (entry.name === "package.json") { try { JSON.parse(content); } catch (error) { failures.push(`package.json is invalid JSON: ${error.message}`); } }
      if (entry.name.endsWith(".js")) {
        const result = spawnSync(process.execPath, ["--check", fullPath], { encoding: "utf8" });
        if (result.status !== 0) failures.push(`${path.relative(root, fullPath)} has invalid JavaScript: ${result.stderr.trim()}`);
      }
    }
  }
};
walk(root);
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("Project structure checks passed.");
