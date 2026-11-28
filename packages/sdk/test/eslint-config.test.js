"use strict";

const assert = require("node:assert/strict");
const { ESLint } = require("eslint");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const config = require("../configs/eslint.config.js");
const test = require("node:test");

test("JavaScript config permits dithr lifecycle entry points", async () => {
    const eslint = new ESLint({
        cwd: path.resolve(__dirname, ".."),
        overrideConfigFile: true,
        overrideConfig: config.js,
    });
    const [result] = await eslint.lintText(
        "function _init() {}\nfunction _update(_dt) {}\nfunction _draw() {}\n",
        { filePath: path.resolve(__dirname, "..", "src", "main.js") },
    );

    assert.equal(
        result.errorCount,
        0,
        result.messages.map((message) => message.message).join("\n"),
    );
    assert.equal(result.warningCount, 0);
});

test("scaffolded JavaScript and TypeScript projects share the build command", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dithr-scaffold-scripts-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    for (const [name, args] of [
        ["js-game", []],
        ["ts-game", ["--typescript"]],
    ]) {
        const result = spawnSync(
            process.execPath,
            [path.resolve(__dirname, "..", "bin", "dithrkit.js"), "create", name, ...args],
            { cwd: root, encoding: "utf-8" },
        );
        assert.equal(result.status, 0, result.stderr);

        const pkg = JSON.parse(fs.readFileSync(path.join(root, name, "package.json"), "utf-8"));
        assert.equal(pkg.scripts.build, "dithrkit build");
        assert.equal(typeof pkg.scripts.lint, "string");
        assert.equal(typeof pkg.scripts["format:check"], "string");
    }
});

test("SDK web shell keeps the canvas within the viewport", () => {
    const sdkShell = fs.readFileSync(
        path.resolve(__dirname, "..", "templates", "shell.html"),
        "utf-8",
    );
    const engineShell = fs.readFileSync(
        path.resolve(__dirname, "..", "..", "..", "tools", "templates", "shell.html"),
        "utf-8",
    );

    assert.equal(sdkShell, engineShell);
    assert.match(sdkShell, /max-width:\s*100vw/);
    assert.match(sdkShell, /max-height:\s*100vh/);
});
