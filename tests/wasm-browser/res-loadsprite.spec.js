/**
 * @file  res-loadsprite.spec.js
 * @brief Browser-side coverage for `res.loadSprite()` end-to-end:
 *        the WASM build is compiled with the Spritemark example (which calls
 *        `res.loadSprite('sheet', 'assets/sprites/spritesheet.png')` from
 *        `_init`), so a successful render with non-background pixels proves
 *        the bundled-asset → stb_image decode → palette quantise → sheet
 *        binding pipeline works inside the browser runtime.
 *
 * This spec piggy-backs on the same dev server as wasm-smoke.spec.js but
 * runs on a different port so they can execute in parallel.
 */

const { test, expect } = require("@playwright/test");

const PORT = 8092;
const BASE_URL = `http://localhost:${PORT}`;

let server;

test.beforeAll(async () => {
    const { spawn } = require("node:child_process");
    const path = require("node:path");

    server = spawn("node", [path.resolve(__dirname, "../../tools/serve-wasm.js"), String(PORT)], {
        stdio: "pipe",
        cwd: path.resolve(__dirname, "../.."),
    });

    await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 2000);
        server.stdout.on("data", (data) => {
            if (data.toString().includes("listening") || data.toString().includes(String(PORT))) {
                clearTimeout(timeout);
                resolve();
            }
        });
    });
});

test.afterAll(async () => {
    if (server) {
        server.kill("SIGTERM");
    }
});

test("res.loadSprite renders sprite pixels in the browser", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    const canvas = page.locator("canvas#canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // Wait for the loading splash to clear (Emscripten + cart `_init` done).
    await page.waitForFunction(
        () => {
            const splash = document.getElementById("splash");
            return splash && splash.classList.contains("hidden");
        },
        { timeout: 30000 },
    );

    // Give the cart a few frames to actually populate the sprite buckets and
    // draw them. Spritemark spawns 200 sprites in `_init` and renders them
    // every frame, so any non-zero rAF time should produce visible output.
    await page.waitForTimeout(500);

    expect(errors).toEqual([]);

    // Read back the canvas pixels and assert that *some* non-background
    // (non-fully-black, non-zero-alpha) colour is present. This proves both
    // the PNG decode succeeded and `gfx.spr` rendered with a bound sheet.
    const stats = await page.evaluate(() => {
        const c = document.getElementById("canvas");
        const tmp = document.createElement("canvas");
        tmp.width = c.width;
        tmp.height = c.height;
        const ctx = tmp.getContext("2d");
        ctx.drawImage(c, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        let nonBg = 0;
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
            total++;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            // Treat near-black opaque or fully transparent as background.
            if (a > 0 && (r > 4 || g > 4 || b > 4)) {
                nonBg++;
            }
        }
        return { nonBg, total, w: c.width, h: c.height };
    });

    expect(stats.w).toBeGreaterThan(0);
    expect(stats.h).toBeGreaterThan(0);
    // At least 0.1% of the framebuffer should be non-background. With ~200
    // sprites of 16x16 on a 320x180 canvas this is comfortably exceeded;
    // the threshold is intentionally low to tolerate aggressive clipping
    // or palette quirks.
    expect(stats.nonBg / stats.total).toBeGreaterThan(0.001);
});
