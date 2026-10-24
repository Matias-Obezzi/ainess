// On the remote page a hook's address comes masked (see remoteConfigView): sent back as it came, the
// host keeps its own. The URL field used to hold the mask to the shape of a URL, so the browser
// refused the form and no other field of the hook could be saved. A new hook still needs a real one.
import { describe, it, expect, beforeEach, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, resetStore } from "@/test/render";
import { HookDialog } from "@/components/HookDialog";
import { SECRET_MASK } from "@/lib/remote-settings-keys";
import { es } from "@/i18n";
import type { Hook } from "@/types";

const webhook: Hook = {
  id: "h1", name: "Aviso", event: "task.finished", enabled: true,
  action: { type: "webhook", url: SECRET_MASK, method: "POST", bodyTemplate: "{{output}}" },
};

const slack: Hook = {
  id: "h2", name: "Slack", event: "task.finished", enabled: true,
  action: { type: "slack", webhookUrl: SECRET_MASK, template: "{{output}}" },
};

describe("a hook whose address came masked", () => {
  beforeEach(() => resetStore());

  it("saves a changed template and sends the mask back for the host to restore", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<HookDialog open onClose={() => {}} hook={webhook} onSave={onSave} />);

    const template = screen.getByDisplayValue("{{output}}");
    await user.clear(template);
    await user.type(template, "listo");
    await user.click(screen.getByRole("button", { name: es["common.save"] }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].action).toMatchObject({ type: "webhook", url: SECRET_MASK, bodyTemplate: "listo" });
  });

  it("does the same for a Slack or Discord webhook", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<HookDialog open onClose={() => {}} hook={slack} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: es["common.save"] }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].action).toMatchObject({ type: "slack", webhookUrl: SECRET_MASK });
  });

  it("still asks a new hook for a real address", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<HookDialog open onClose={() => {}} onSave={onSave} />);

    const action = screen.getAllByRole("combobox").find(c => c.textContent?.includes(es["hookDialog.action.notify"]))!;
    await user.click(action);
    await user.click(await screen.findByRole("option", { name: es["hookDialog.action.webhook"] }));

    const [name, url] = screen.getAllByRole("textbox");
    await user.type(name, "Nuevo");
    await user.type(url, SECRET_MASK);
    await user.click(screen.getByRole("button", { name: es["common.save"] }));
    expect(onSave).not.toHaveBeenCalled();

    await user.clear(url);
    await user.type(url, "https://example.com/hook");
    await user.click(screen.getByRole("button", { name: es["common.save"] }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].action).toMatchObject({ type: "webhook", url: "https://example.com/hook" });
  });
});
