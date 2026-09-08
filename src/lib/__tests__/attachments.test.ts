// Attaching a file: what it ends up called inside the project, and what the agent is told about it.
import { describe, it, expect, beforeEach } from "vitest";
import { attachmentName, attachmentsBlock, humanSize, isImage, saveAttachments } from "@/lib/attachments";
import { setTransport, getTransport } from "@/lib/transport";

const AT = new Date(2026, 8, 8, 14, 5, 3); // 8 September 2026, 14:05:03

describe("attachmentName", () => {
  it("dates it and leaves nothing a path could read as something else", () => {
    expect(attachmentName("captura.png", AT)).toBe("20260908-140503-captura.png");
    expect(attachmentName("../../etc/passwd", AT)).toBe("20260908-140503-etc-passwd");
    expect(attachmentName("informe final (v2).pdf", AT)).toBe("20260908-140503-informe-final-v2-.pdf");
  });

  it("always answers something, even for a file with no name", () => {
    expect(attachmentName("", AT)).toBe("20260908-140503-file");
    expect(attachmentName("!!!", AT)).toBe("20260908-140503-file");
  });
});

describe("the lines added to the prompt", () => {
  it("says nothing when nothing was attached", () => {
    expect(attachmentsBlock([])).toBe("");
  });

  it("lists each path relative to the workspace", () => {
    const block = attachmentsBlock([".ainess/attachments/a.png", ".ainess/attachments/b.pdf"]);
    expect(block).toContain("- .ainess/attachments/a.png");
    expect(block).toContain("- .ainess/attachments/b.pdf");
  });
});

describe("saveAttachments", () => {
  const written: { path: string; data: string }[] = [];

  beforeEach(() => {
    written.length = 0;
    setTransport({
      ...getTransport(),
      writeFileBytes: async (path: string, data: string) => { written.push({ path, data }); },
    } as any);
  });

  const fileOf = (name: string, body = "hola") => ({
    name,
    size: body.length,
    type: "text/plain",
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  }) as unknown as File;

  it("writes into the project and answers with the relative paths", async () => {
    const paths = await saveAttachments([fileOf("nota.txt")], "C:/repos/shop", AT);
    expect(paths).toEqual([".ainess/attachments/20260908-140503-nota.txt"]);
    expect(written[0].path).toBe("C:/repos/shop/.ainess/attachments/20260908-140503-nota.txt");
    expect(atob(written[0].data)).toBe("hola");
  });

  it("does not let two files of the same name land on each other", async () => {
    const paths = await saveAttachments([fileOf("nota.txt"), fileOf("nota.txt")], "C:/repos/shop", AT);
    expect(new Set(paths).size).toBe(2);
  });

  it("keeps the ones it could write when one fails", async () => {
    setTransport({
      ...getTransport(),
      writeFileBytes: async (path: string) => {
        if (path.includes("mala")) throw new Error("disco lleno");
      },
    } as any);
    const paths = await saveAttachments([fileOf("mala.txt"), fileOf("buena.txt")], "C:/repos/shop", AT);
    expect(paths).toEqual([".ainess/attachments/20260908-140503-buena.txt"]);
  });

  it("has nothing to do without a workspace", async () => {
    expect(await saveAttachments([fileOf("nota.txt")], "")).toEqual([]);
  });
});

describe("what the chip shows", () => {
  it("tells an image from anything else", () => {
    expect(isImage({ type: "image/png" })).toBe(true);
    expect(isImage({ type: "application/pdf" })).toBe(false);
  });

  it("says the size the way a person reads it", () => {
    expect(humanSize(512)).toBe("512 B");
    expect(humanSize(2048)).toBe("2 KB");
    expect(humanSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
