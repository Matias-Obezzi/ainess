// Unhandled render errors used to crash the React tree without trace, leaving a blank screen.
// The ErrorBoundary traps render errors, keeping failure contained within the panel and showing
// a recoverable fallback UI with error details instead of blanking the screen.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { ErrorBoundary } from "../ErrorBoundary";
import { es } from "@/i18n";

function ThrowingComponent({ errorMsg }: { errorMsg: string }): never {
  throw new Error(errorMsg);
}

describe("ErrorBoundary", () => {
  it("renders healthy children normally when no error occurs", () => {
    render(
      <ErrorBoundary where="test">
        <div>Contenido sano</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText("Contenido sano")).toBeInTheDocument();
  });

  it("renders fallback UI when a child component throws during render", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary where="test">
        <ThrowingComponent errorMsg="Explosión controlada" />
      </ErrorBoundary>,
    );

    expect(screen.getByText(es["error.panel.title"])).toBeInTheDocument();
    expect(screen.getByText("Explosión controlada")).toBeInTheDocument();
    expect(screen.getByText(es["error.panel.retry"])).toBeInTheDocument();

    errorSpy.mockRestore();
  });
});
