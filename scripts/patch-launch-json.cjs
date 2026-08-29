const fs = require("fs");
const path = require("path");

const browserPath = process.argv[2];
if (!browserPath) {
    console.error("Usage: node patch-launch-json.js <browserExecutablePath>");
    process.exit(1);
}

const launchJsonPath = path.join(__dirname, "..", ".vscode", "launch.json");
const config = JSON.parse(fs.readFileSync(launchJsonPath, "utf8"));

let changed = false;
for (const entry of config.configurations) {
    if (entry.type === "chrome" && entry.request === "launch" && !entry.runtimeExecutable) {
        entry.runtimeExecutable = browserPath;
        changed = true;
    }
}

if (changed) {
    fs.writeFileSync(launchJsonPath, JSON.stringify(config, null, 2) + "\n");
    console.log("Updated .vscode/launch.json with runtimeExecutable: " + browserPath);
} else {
    console.log(".vscode/launch.json already up to date.");
}
