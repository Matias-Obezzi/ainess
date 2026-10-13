// What the user sees while an agent waits on them, and what their click sends back.
import { describe, it, expect, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, resetStore } from "@/test/render";
import { LiveRequests } from "@/components/shell/LiveRequestCard";
import { askLive } from "@/lib/live-requests";
import { act } from "@testing-library/react";

describe("LiveRequests", () => {
  beforeEach(() => resetStore());

  it("answers a permission with the option clicked", async () => {
    render(<LiveRequests runId="r1" />);
    let answer: unknown;
    await act(async () => {
      void askLive({
        kind: "permission", runId: "r1", projectId: "p", agentId: "a", title: "Bash", detail: "npm install",
        options: [{ id: "yes", name: "Allow", kind: "allow_once" }, { id: "no", name: "Reject", kind: "reject_once" }],
      }).then(a => { answer = a; });
    });
    expect(screen.getByText("npm install")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Rechazar|Reject/ }));
    expect(answer).toEqual({ kind: "permission", optionId: "no" });
    expect(screen.queryByText("npm install")).toBeNull();
  });

  it("sends a form only once its required answer is there", async () => {
    render(<LiveRequests runId="r2" />);
    let answer: unknown;
    await act(async () => {
      void askLive({
        kind: "form", runId: "r2", projectId: "p", agentId: "a", message: "¿Qué framework?",
        fields: [{ key: "q0", title: "Framework", kind: "choice", required: true, options: [{ value: "Vite", label: "Vite" }, { value: "Next", label: "Next" }] }],
      }).then(a => { answer = a; });
    });
    const send = screen.getByRole("button", { name: /Responder|Answer/ });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(send);
    expect(answer).toEqual({ kind: "form", action: "accept", content: { q0: "Next" } });
  });
});
