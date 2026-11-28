"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { stageCart } = require("./stage-cart.js");

test("stageCart excludes development files and preserves runtime files", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dithr-stage-cart-"));
    const sourceDir = path.join(root, "source");
    const outputDir = path.join(root, "output");
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    fs.mkdirSync(path.join(sourceDir, "dist"), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, "assets", "sfx"), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, "node_modules", "package"), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "cart.json"), JSON.stringify({ code: "dist/main.js" }));
    fs.writeFileSync(path.join(sourceDir, "dist", "main.js"), "game");
    fs.writeFileSync(path.join(sourceDir, "src", "main.ts"), "source");
    fs.writeFileSync(path.join(sourceDir, "assets", "sfx", "jump.wav"), "sound");
    fs.writeFileSync(path.join(sourceDir, "node_modules", "package", "index.js"), "dependency");
    fs.writeFileSync(path.join(sourceDir, "map.json"), "{}");
    fs.writeFileSync(path.join(sourceDir, "package.json"), "{}");
    fs.writeFileSync(path.join(sourceDir, "package-lock.json"), "{}");
    fs.writeFileSync(path.join(sourceDir, ".editorconfig"), "tooling");

    stageCart(sourceDir, outputDir);

    assert.equal(fs.readFileSync(path.join(outputDir, "dist", "main.js"), "utf-8"), "game");
    assert.equal(
        fs.readFileSync(path.join(outputDir, "assets", "sfx", "jump.wav"), "utf-8"),
        "sound",
    );
    assert.equal(fs.readFileSync(path.join(outputDir, "map.json"), "utf-8"), "{}");
    assert.equal(fs.existsSync(path.join(outputDir, "src")), false);
    assert.equal(fs.existsSync(path.join(outputDir, "node_modules")), false);
    assert.equal(fs.existsSync(path.join(outputDir, "package.json")), false);
    assert.equal(fs.existsSync(path.join(outputDir, ".editorconfig")), false);
});

test("stageCart rejects entry points outside the cart", (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dithr-stage-cart-"));
    const sourceDir = path.join(root, "source");
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    fs.mkdirSync(sourceDir);
    fs.writeFileSync(path.join(sourceDir, "cart.json"), JSON.stringify({ code: "../main.js" }));
    fs.writeFileSync(path.join(root, "main.js"), "outside");

    assert.throws(() => stageCart(sourceDir, path.join(root, "output")), /outside the cart/);
});
