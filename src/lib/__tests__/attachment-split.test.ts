// A sent message carries two things: what the user typed, and where the files they attached
// landed. The second is for the agent — it has no other way to find them — and reading it back in
// the thread is reading plumbing.
import { describe, it, expect } from "vitest";
import { attachmentsBlock, splitAttachments, ATTACHMENTS_DIR } from "@/lib/attachments";

const shot = `${ATTACHMENTS_DIR}/20260925-143423-image.png`;
const pdf = `${ATTACHMENTS_DIR}/20260925-143500-plan.pdf`;

describe("splitAttachments", () => {
  it("takes back apart what attachmentsBlock put together", () => {
    const prompt = "mirá esto" + attachmentsBlock([shot, pdf]);
    expect(splitAttachments(prompt)).toEqual({ body: "mirá esto", paths: [shot, pdf] });
  });

  it("reads a message that is nothing but the files", () => {
    expect(splitAttachments(attachmentsBlock([shot]))).toEqual({ body: "", paths: [shot] });
  });

  it("does not care which language wrote the header", () => {
    const prompt = `qué opinás\n\nAnhänge (lies sie aus dem Repo):\n- ${shot}`;
    expect(splitAttachments(prompt)).toEqual({ body: "qué opinás", paths: [shot] });
  });

  it("leaves a message with no attachments exactly as it is", () => {
    const prompt = "arreglá el login\n\n- un item\n- otro item";
    expect(splitAttachments(prompt)).toEqual({ body: prompt, paths: [] });
  });

  it("does not eat a list the user wrote themselves", () => {
    const prompt = "pasos:\n- abrir el repo\n- correr los tests";
    expect(splitAttachments(prompt).paths).toEqual([]);
  });

  it("keeps the markdown of the message it splits off", () => {
    const prompt = "# Título\n\n- uno\n- dos" + attachmentsBlock([shot]);
    const { body, paths } = splitAttachments(prompt);
    expect(body).toBe("# Título\n\n- uno\n- dos");
    expect(paths).toEqual([shot]);
  });

  it("ignores a path that only looks like one of ours", () => {
    const prompt = "mirá\n\nArchivos adjuntos (leelos desde el repo):\n- src/lib/foo.ts";
    expect(splitAttachments(prompt).paths).toEqual([]);
  });

  it("survives an empty prompt", () => {
    expect(splitAttachments("")).toEqual({ body: "", paths: [] });
  });
});
