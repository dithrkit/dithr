// tests/tools/cart-export.test.mjs
//
// Round-trip test for tools/cart-export.js. Verifies that:
//   1. The CLI produces a valid HTML file for a known fixture cart.
//   2. The embedded `window.DITHR_CART` JSON preserves every field of the
//      source cart and adds an `_embedded` block with the inlined JS source
//      and base-64 sprite sheet.
//   3. Re-extracting the embedded JSON yields a logically equivalent cart
//      that round-trips through JSON.parse / JSON.stringify.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..");
const fixtureDir = join(repoRoot, "tests", "fixtures", "round_trip_cart");
const fixtureCart = join(fixtureDir, "cart.json");
const cliScript = join(repoRoot, "tools", "cart-export.js");

const require = createRequire(import.meta.url);
const { exportCart } = require(cliScript);

function extractEmbeddedCart(html) {
    const m = html.match(/window\.DITHR_CART\s*=\s*(\{[\s\S]*?\});/);
    assert.ok(m, "embedded DITHR_CART assignment not found in exported HTML");
    return JSON.parse(m[1]);
}

test("exportCart() round-trips fixture cart fields", () => {
    const result = exportCart(fixtureCart, { outFile: "ignored.html" });
    const original = JSON.parse(readFileSync(fixtureCart, "utf-8"));

    assert.equal(result.exportCart.title, original.title);
    assert.deepEqual(result.exportCart.display, original.display);
    assert.deepEqual(result.exportCart.timing, original.timing);
    assert.deepEqual(result.exportCart.audio, original.audio);
    assert.equal(result.exportCart.code, original.code);
    assert.deepEqual(result.exportCart.sprites, original.sprites);

    // _embedded block populated
    assert.ok(result.exportCart._embedded, "_embedded missing");
    assert.equal(typeof result.exportCart._embedded.code, "string");
    assert.ok(
        result.exportCart._embedded.code.length > 0,
        "embedded code source should be non-empty",
    );
    assert.match(
        result.exportCart._embedded.sprites,
        /^data:image\/png;base64,/,
        "sprite data URL should be a base64 PNG",
    );

    // Source code preserved byte-for-byte
    const codePath = join(fixtureDir, original.code);
    assert.equal(result.exportCart._embedded.code, readFileSync(codePath, "utf-8"));

    // Sprite bytes preserved byte-for-byte
    const sheetPath = join(fixtureDir, original.sprites.sheet);
    const expectedB64 = readFileSync(sheetPath).toString("base64");
    assert.equal(result.exportCart._embedded.sprites, `data:image/png;base64,${expectedB64}`);
});

test("exportCart() HTML embeds the same JSON the function returns", () => {
    const result = exportCart(fixtureCart, { outFile: "ignored.html" });
    const extracted = extractEmbeddedCart(result.html);
    assert.deepEqual(extracted, result.exportCart);
});

test("CLI writes HTML matching exportCart() output", () => {
    const dir = mkdtempSync(join(tmpdir(), "dithr-cart-export-"));
    try {
        const outFile = join(dir, "cart.html");
        execFileSync(
            process.execPath,
            [cliScript, fixtureCart, "--out", outFile],
            { stdio: "pipe" },
        );
        assert.ok(existsSync(outFile), "CLI did not write expected output file");

        const html = readFileSync(outFile, "utf-8");
        const extracted = extractEmbeddedCart(html);
        const programmatic = exportCart(fixtureCart, { outFile }).exportCart;
        assert.deepEqual(extracted, programmatic);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
