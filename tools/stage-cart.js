#!/usr/bin/env node
/**
 * @file  stage-cart.js
 * @brief Copies only the runtime files from a cart into a staging directory.
 *
 * Usage: node tools/stage-cart.js <cart-dir> <output-dir>
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEV_ROOT_FILES = new Set([
    "eslint.config.js",
    "package-lock.json",
    "package.json",
    "tsconfig.json",
]);
const RUNTIME_DATA_EXTENSIONS = new Set([
    ".hex",
    ".json",
    ".mp3",
    ".ogg",
    ".png",
    ".tmx",
    ".txt",
    ".wav",
]);

function isWithin(parent, child) {
    const relative = path.relative(parent, child);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function copyFile(sourceRoot, outputRoot, relativePath) {
    const sourcePath = path.resolve(sourceRoot, relativePath);
    if (!isWithin(sourceRoot, sourcePath) || !fs.statSync(sourcePath).isFile()) {
        throw new Error(`Runtime path is missing or outside the cart: ${relativePath}`);
    }

    const outputPath = path.join(outputRoot, relativePath);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.copyFileSync(sourcePath, outputPath);
}

function stageCart(sourceDir, outputDir) {
    const sourceRoot = path.resolve(sourceDir);
    const outputRoot = path.resolve(outputDir);
    const cartPath = path.join(sourceRoot, "cart.json");
    const cart = JSON.parse(fs.readFileSync(cartPath, "utf-8"));

    if (typeof cart.code !== "string" || cart.code.length === 0) {
        throw new Error("cart.json must define a non-empty code entry point");
    }

    fs.rmSync(outputRoot, { recursive: true, force: true });
    fs.mkdirSync(outputRoot, { recursive: true });
    copyFile(sourceRoot, outputRoot, "cart.json");
    copyFile(sourceRoot, outputRoot, cart.code);

    const assetsDir = path.join(sourceRoot, "assets");
    if (fs.existsSync(assetsDir)) {
        fs.cpSync(assetsDir, path.join(outputRoot, "assets"), {
            recursive: true,
            dereference: false,
        });
    }

    for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name === "cart.json" || entry.name.startsWith(".")) {
            continue;
        }
        if (DEV_ROOT_FILES.has(entry.name)) {
            continue;
        }
        if (RUNTIME_DATA_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            copyFile(sourceRoot, outputRoot, entry.name);
        }
    }
}

function main() {
    const sourceDir = process.argv[2];
    const outputDir = process.argv[3];
    if (!sourceDir || !outputDir || process.argv.length !== 4) {
        console.error("Usage: stage-cart.js <cart-dir> <output-dir>");
        process.exit(1);
    }

    stageCart(sourceDir, outputDir);
}

if (require.main === module) {
    main();
}

module.exports = { stageCart };
