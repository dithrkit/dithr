"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { buildSync } = require("../lib/build-helper.js");

test("buildSync runs the installed esbuild executable", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dithr-build-helper-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(path.join(root, "cart.json"), JSON.stringify({ code: "dist/main.js" }));
    fs.writeFileSync(path.join(root, "src", "main.ts"), "export function answer() { return 42; }");

    assert.equal(buildSync(root), true);
    assert.match(fs.readFileSync(path.join(root, "dist", "main.js"), "utf-8"), /answer/);
});
