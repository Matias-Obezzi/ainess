// Verification commands protect a project by rejecting commands containing shell operators
// like `&&`, pipes, or redirects that cannot be safely executed directly without a shell,
// while showing how the command will be tokenized when valid.
import { describe, it, expect, beforeEach } from "vitest";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { render, screen, fireEvent } from "@/test/render";
import { VerifySection } from "../VerifySection";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { es } from "@/i18n";
import type { VerifyCommand } from "@/types";

function ControlledVerifySection({ initialCommands = [] }: { initialCommands?: VerifyCommand[] }) {
  const [commands, setCommands] = useState<VerifyCommand[]>(initialCommands);
  return <VerifySection workspaceDir="" commands={commands} onChange={setCommands} />;
}

describe("VerifySection", () => {
  beforeEach(() => {
    setTransport(nullTransport);
  });

  it("rejects shell operators and shows the reason when adding a command", async () => {
    const user = userEvent.setup();
    render(<ControlledVerifySection />);

    const addButton = screen.getByRole("button", { name: new RegExp(es["verify.add"], "i") });
    await user.click(addButton);

    const input = screen.getByPlaceholderText(es["verify.commandPlaceholder"]);
    fireEvent.change(input, { target: { value: "npm test && rm -rf /" } });

    const expectedError = es["verify.problem.shellOperator"].replace("{op}", "&&");
    expect(screen.getByText(expectedError)).toBeInTheDocument();
  });

  it("shows parsed tokens separated by middle dots when a valid command is entered", async () => {
    const user = userEvent.setup();
    render(<ControlledVerifySection />);

    const addButton = screen.getByRole("button", { name: new RegExp(es["verify.add"], "i") });
    await user.click(addButton);

    const input = screen.getByPlaceholderText(es["verify.commandPlaceholder"]);
    fireEvent.change(input, { target: { value: "npx tsc --noEmit" } });

    expect(screen.getByText(/npx\s+·\s+tsc\s+·\s+--noEmit/)).toBeInTheDocument();
  });
});
