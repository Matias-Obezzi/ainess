import type { ReactElement } from "react";
import { render as rtlRender, type RenderOptions } from "@testing-library/react";
import { useAppStore } from "@/store";
import { TooltipProvider } from "@/components/ui/tooltip";

// Snapshot the initial Zustand store state when this module loads.
const initialStoreState = useAppStore.getState();

/**
 * Resets the Zustand global store back to its initial state.
 * Use this in beforeEach / afterEach across component tests to prevent state leakage.
 */
export function resetStore(): void {
  useAppStore.setState(initialStoreState, true);
}

export function AllTheProviders({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

export function render(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return rtlRender(ui, { wrapper: AllTheProviders, ...options });
}

export * from "@testing-library/react";
