/**
 * @file  wasm-smoke.spec.js
 * @brief Playwright smoke test — loads the WASM build in a headless browser
 *        and verifies the canvas renders at least one frame.
 *
 * Expects the WASM build output in build/wasm/, unless DTR_WASM_SERVE_DIR is set.
 */

const { test, expect } = require("@playwright/test");

const PORT = 8091;
const BASE_URL = `http://localhost:${PORT}`;

let server;

test.beforeAll(async () => {
    const { spawn } = require("node:child_process");
    const path = require("node:path");

    const serveDir = process.env.DTR_WASM_SERVE_DIR;
    server = spawn("node", [path.resolve(__dirname, "../../tools/serve-wasm.js"), String(PORT)], {
        stdio: "pipe",
        cwd: path.resolve(__dirname, "../.."),
        env: { ...process.env, ...(serveDir ? { DTR_WASM_SERVE_DIR: serveDir } : {}) },
    });

    // Wait for the server to start listening
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Server start timeout")), 10000);
        server.stdout.on("data", (data) => {
            if (data.toString().includes("listening") || data.toString().includes(String(PORT))) {
                clearTimeout(timeout);
                resolve();
            }
        });
        // Also resolve after a short delay in case there's no stdout output
        setTimeout(() => {
            clearTimeout(timeout);
            resolve();
        }, 2000);
    });
});

test.afterAll(async () => {
    if (server) {
        server.kill("SIGTERM");
    }
});

test("WASM build loads and renders a frame", async ({ page }) => {
    const errors = [];
    const consoleLogs = [];
    const failedRequests = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (message) => consoleLogs.push(message.text()));
    page.on("requestfailed", (request) => failedRequests.push(request.url()));

    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for the canvas element to appear
    const canvas = page.locator("canvas#canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // Wait for Emscripten module to initialise — the splash overlay hides
    // when loading completes. Give it time for WASM compilation + data fetch.
    await page.waitForFunction(
        () => {
            const splash = document.getElementById("splash");
            return splash && splash.classList.contains("hidden");
        },
        { timeout: 30000 },
    );

    await expect
        .poll(
            async () => {
                return canvas.evaluate((element) => {
                    return new Promise((resolve) => {
                        const image = new Image();
                        image.onload = () => {
                            const copy = document.createElement("canvas");
                            copy.width = image.width;
                            copy.height = image.height;
                            const ctx = copy.getContext("2d");
                            ctx.drawImage(image, 0, 0);
                            const pixels = ctx.getImageData(0, 0, copy.width, copy.height).data;
                            let visible = 0;
                            for (let i = 0; i < pixels.length; i += 4) {
                                if (pixels[i] || pixels[i + 1] || pixels[i + 2]) {
                                    visible++;
                                }
                            }
                            resolve(visible);
                        };
                        image.src = element.toDataURL("image/png");
                    });
                });
            },
            { timeout: 15000 },
        )
        .toBeGreaterThan(50);

    expect(consoleLogs.some((line) => line.includes("loading /cart/cart.json"))).toBe(true);
    expect(consoleLogs.some((line) => line.includes("No cart file"))).toBe(false);
    expect(errors).toEqual([]);
    expect(failedRequests).toEqual([]);

    // Verify the canvas has non-zero dimensions (rendering initialised)
    const box = await canvas.boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
});
