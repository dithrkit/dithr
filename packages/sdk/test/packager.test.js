"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { generatePackageLoader, packDirectory } = require("../lib/packager.js");

test("packDirectory excludes generated and dependency directories", (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dithr-packager-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.mkdirSync(path.join(dir, "node_modules", "example"), { recursive: true });
    fs.mkdirSync(path.join(dir, "build"), { recursive: true });
    fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "main.js"), "game");
    fs.writeFileSync(path.join(dir, "node_modules", "example", "index.js"), "dependency");
    fs.writeFileSync(path.join(dir, "build", "output.js"), "generated");
    fs.writeFileSync(path.join(dir, ".git", "config"), "metadata");

    const result = packDirectory(dir, "/cart");

    assert.deepEqual(
        result.files.map((file) => file.filename),
        ["/cart/src/main.js"],
    );
    assert.equal(result.dataBuffer.toString(), "game");
});

test("generatePackageLoader uses valid exported FS paths", () => {
    const loader = generatePackageLoader("dithr.data", [
        { filename: "/cart/src/main.js", start: 0, end: 4 },
    ]);

    assert.match(loader, /Module\.FS\.createPath\('\/', 'cart', true, true\)/);
    assert.match(loader, /Module\.FS\.createPath\('\/cart', 'src', true, true\)/);
    assert.match(loader, /Module\.FS\.createDataFile/);
    assert.doesNotMatch(loader, /FS_createPath|FS_createDataFile|\/\/cart/);
});
