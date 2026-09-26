// Which files the preview panel can draw instead of read.
//
// A file that is there but is not text used to come back from `readFileAbs` as null, which the
// panel could not tell apart from a file that is not there: it said "Not found" about a screenshot
// while printing the path it was sitting at.
import { describe, it, expect } from "vitest";
import { imageTypeOf, MAX_IMAGE_BYTES } from "@/lib/file-preview";

describe("imageTypeOf", () => {
  it("knows the ones a browser draws on its own", () => {
    expect(imageTypeOf(".ainess/attachments/20260925-143423-image.png")).toBe("image/png");
    expect(imageTypeOf("shot.jpg")).toBe("image/jpeg");
    expect(imageTypeOf("shot.jpeg")).toBe("image/jpeg");
    expect(imageTypeOf("anim.gif")).toBe("image/gif");
    expect(imageTypeOf("pic.webp")).toBe("image/webp");
    expect(imageTypeOf("logo.svg")).toBe("image/svg+xml");
  });

  it("does not care how the extension was typed", () => {
    expect(imageTypeOf("C:/Users/matia/Desktop/SHOT.PNG")).toBe("image/png");
    expect(imageTypeOf("Shot.JpG")).toBe("image/jpeg");
  });

  it("says nothing for what it cannot draw", () => {
    // These are not missing files — the panel has to say so rather than "not found".
    expect(imageTypeOf("plan.pdf")).toBeUndefined();
    expect(imageTypeOf("bundle.zip")).toBeUndefined();
    expect(imageTypeOf("src/lib/foo.ts")).toBeUndefined();
    expect(imageTypeOf("README")).toBeUndefined();
    expect(imageTypeOf("")).toBeUndefined();
  });

  it("is not fooled by a dot in a folder name", () => {
    expect(imageTypeOf(".ainess/attachments/notes")).toBeUndefined();
  });

  it("allows an image far bigger than a text preview would", () => {
    // A screenshot past the text cap is still a screenshot worth looking at.
    expect(MAX_IMAGE_BYTES).toBeGreaterThan(1024 * 1024);
  });
});
