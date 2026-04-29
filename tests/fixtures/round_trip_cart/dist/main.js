// Minimal cart entry point used by the cart-export round-trip test.
// The contents must round-trip byte-for-byte through the inliner.
export function update() {}
export function draw() {
    gfx.cls(0);
    gfx.print("hello, round trip", 4, 4, 7);
}
