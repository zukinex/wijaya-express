import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const PUBLIC = path.join(ROOT, "public");

function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  // PNG signature + IHDR chunk: width at bytes 16-19, height at 20-23.
  expect(buf.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("PWA manifest", () => {
  it("is valid JSON with the fields browsers need to offer install", () => {
    const manifestPath = path.join(PUBLIC, "manifest.webmanifest");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.name).toContain("Wijaya Express");
    expect(manifest.name).toContain("Nganjuk");
    expect(manifest.name).toContain("Jombang");
    expect(manifest.description).toContain("Nganjuk dan Jombang");
    expect(manifest.short_name).toBe("Wijaya Express");
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#16a34a");
    expect(manifest.lang).toBe("id");
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(
      manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable"),
    ).toBe(true);
  });

  it("lists icon files that exist as real PNGs at the declared sizes", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(PUBLIC, "manifest.webmanifest"), "utf-8"),
    );
    for (const icon of manifest.icons) {
      const file = path.join(PUBLIC, icon.src.replace(/^\//, ""));
      expect(existsSync(file)).toBe(true);
      const [w, h] = icon.sizes.split("x").map(Number);
      expect(pngSize(file)).toEqual({ width: w, height: h });
    }
    expect(pngSize(path.join(PUBLIC, "icons/apple-touch-icon.png"))).toEqual({
      width: 180,
      height: 180,
    });
  });
});

describe("service worker", () => {
  it("exists, caches the app shell, and has a clear offline message", () => {
    const swPath = path.join(PUBLIC, "sw.js");
    expect(existsSync(swPath)).toBe(true);
    const sw = readFileSync(swPath, "utf-8");
    expect(sw).toContain("wijaya-express-v1");
    for (const route of ["/", "/pesan", "/driver"]) {
      expect(sw).toContain(`"${route}"`);
    }
    expect(sw).toContain("Kamu sedang offline");
    // Must never cache API traffic or non-GET requests.
    expect(sw).toContain('request.method !== "GET"');
    expect(sw).toContain("url.origin !== self.location.origin");
  });
});
