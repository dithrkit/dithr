#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const version = process.argv[2]?.replace(/^v/, "");
if (!version) {
    console.error("Usage: npm-published-e2e.js <version>");
    process.exit(1);
}

const packages = ["win32-x64", "linux-x64", "linux-arm64", "darwin-arm64", "wasm", "sdk", "create"];
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const workDir = process.env.E2E_WORK_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "dithr-npm-"));

function run(command, args, cwd = workDir) {
    console.log(`\n$ ${command} ${args.join(" ")}`);
    const result = spawnSync(command, args, {
        cwd,
        env: process.env,
        stdio: "inherit",
        shell: false,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`${command} exited with status ${result.status}`);
    }
}

function packageVersion(name) {
    const result = spawnSync(npm, ["view", `@dithrkit/${name}@${version}`, "version", "--json"], {
        cwd: workDir,
        encoding: "utf-8",
        shell: false,
    });
    return result.status === 0 ? result.stdout.trim().replaceAll('"', "") : null;
}

async function waitForPackages() {
    const deadline = Date.now() + 5 * 60 * 1000;
    while (true) {
        const missing = packages.filter((name) => packageVersion(name) !== version);
        if (missing.length === 0) return;
        if (Date.now() >= deadline) {
            throw new Error(`npm packages not visible for ${version}: ${missing.join(", ")}`);
        }
        console.log(`Waiting for npm propagation: ${missing.join(", ")}`);
        await new Promise((resolve) => setTimeout(resolve, 15000));
    }
}

function assertFile(file) {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size === 0) {
        throw new Error(`Expected non-empty file: ${file}`);
    }
}

async function main() {
    fs.mkdirSync(workDir, { recursive: true });
    await waitForPackages();
    run(npm, ["init", "--yes"]);
    run(npm, ["install", "--no-save", `@dithrkit/create@${version}`]);
    const createEntry = path.join(workDir, "node_modules", "@dithrkit", "create", "index.js");
    assertFile(createEntry);

    for (const projectType of ["javascript", "typescript"]) {
        const project = `consumer-${projectType}`;
        const projectDir = path.join(workDir, project);
        fs.rmSync(projectDir, { recursive: true, force: true });

        const createArgs = [createEntry, project];
        if (projectType === "typescript") createArgs.push("--typescript");
        run(process.execPath, createArgs);

        run(npm, ["install"], projectDir);
        run(npm, ["audit", "--audit-level=high"], projectDir);
        run(npm, ["run", "lint"], projectDir);
        run(npm, ["run", "format:check"], projectDir);
        run(npm, ["run", "build"], projectDir);
        if (projectType === "typescript") run(npm, ["run", "typecheck"], projectDir);

        run(npx, ["dithrkit", "--version"], projectDir);
        run(npx, ["dithrkit", "export", "--web", "--out", "build/web"], projectDir);
        run(npx, ["dithrkit", "export", "--desktop", "--out", "build/desktop"], projectDir);

        for (const file of [
            "build/web/index.html",
            "build/web/dithr.js",
            "build/web/dithr.wasm",
            "build/web/dithr.data",
            "build/web/dithr.data.js",
            "build/desktop/cart/cart.json",
        ]) {
            assertFile(path.join(projectDir, file));
        }

        const binary =
            process.platform === "win32"
                ? path.join(projectDir, "build/desktop/dithr.exe")
                : path.join(projectDir, "build/desktop/dithr");
        assertFile(binary);
        run(
            binary,
            ["--headless", "--frames", "2", path.join("build", "desktop", "cart", "cart.json")],
            projectDir,
        );
    }

    console.log(`Published @dithrkit packages ${version} passed consumer E2E in ${workDir}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
