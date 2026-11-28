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
    await page.addInitScript(() => {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        window.__dithrAudioContexts = [];
        window.AudioContext = class extends AudioContextClass {
            constructor(...args) {
                super(...args);
                window.__dithrAudioContexts.push(this);
            }
        };
    });
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (message) => consoleLogs.push(message.text()));
    page.on("requestfailed", (request) => failedRequests.push(request.url()));

    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for the canvas element to appear
    const canvas = page.locator("canvas#canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });
    await page.waitForFunction(() => window.__dithrReady === true, null, { timeout: 30000 });
    expect(await page.evaluate(() => window.__dithrAudioReady)).toBe(true);
    await page.evaluate(() => document.getElementById("splash")?.classList.add("hidden"));

    await expect
        .poll(
            async () => {
                // Screenshot the compositor: WebGL may discard the readable canvas buffer.
                const rendered = await canvas.screenshot();
                await page.evaluate(
                    (canvasElement) => {
                        const bounds = canvasElement.getBoundingClientRect();
                        const overlay = document.createElement("div");
                        overlay.id = "dithr-blank-reference";
                        overlay.style.cssText = `position:fixed;left:${bounds.left}px;top:${bounds.top}px;width:${bounds.width}px;height:${bounds.height}px;background:#111;z-index:2147483647`;
                        document.body.appendChild(overlay);
                    },
                    await canvas.elementHandle(),
                );
                const blank = await canvas.screenshot();
                await page.evaluate(() =>
                    document.getElementById("dithr-blank-reference")?.remove(),
                );
                return rendered.equals(blank) ? 0 : 1;
            },
            { timeout: 15000 },
        )
        .toBe(1);

    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await canvas.click();
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(500);
    await expect
        .poll(
            () =>
                page.evaluate(() =>
                    window.__dithrAudioContexts?.some((context) => context.state === "running"),
                ),
            { timeout: 10000 },
        )
        .toBe(true);

    const persistenceToken = `dithr-e2e-${Date.now()}`;
    await page.evaluate((token) => {
        Module.FS.writeFile("/libsdl/browser-smoke.txt", token);
        return new Promise((resolve, reject) => {
            Module.FS.syncfs(false, (error) => (error ? reject(error) : resolve()));
        });
    }, persistenceToken);

    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => window.__dithrReady === true, null, { timeout: 30000 });
    expect(
        await page.evaluate(() => {
            return new TextDecoder().decode(Module.FS.readFile("/libsdl/browser-smoke.txt"));
        }),
    ).toBe(persistenceToken);
    await page.evaluate(() => document.getElementById("splash")?.classList.add("hidden"));

    expect(consoleLogs.some((line) => line.includes("No cart file"))).toBe(false);
    expect(errors).toEqual([]);
    expect(failedRequests).toEqual([]);

    // Verify the canvas has non-zero dimensions (rendering initialised)
    const box = await page.locator("canvas#canvas").boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    expect(box.width).toBeLessThanOrEqual(800);
    expect(box.height).toBeLessThanOrEqual(600);
});
