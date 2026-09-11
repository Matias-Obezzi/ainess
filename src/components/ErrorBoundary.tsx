// What a screen does when it throws.
//
// Until now: nothing, anywhere in the app. React with no boundary unmounts the whole tree on a
// render error, and a user reporting "the chat went black" is reporting exactly that — with no
// message, no stack, and nothing in the log, because the thing that would have written it down is
// the thing that died.
//
// So this is a diagnostic instrument before it is a nicety. It keeps the failure inside the panel
// that failed, says what threw, and writes it to the log where `ainess logs` can find it. Guessing
// at an invisible crash from the outside is how two fixes went out for a bug that was never the one
// being fixed.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { log } from "@/lib/logger";
import { translateNow } from "@/i18n/useT";

interface Props {
  children: ReactNode;
  /** Named in the log so a report says which panel died, not just that one did. */
  where: string;
  /** Changing this puts the boundary back on its feet — leaving a conversation, say. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The stack goes to the log and not to the screen: it is the part that identifies the bug, and
    // the part nobody can act on while looking at it.
    log.error("ui", `${this.props.where} failed: ${error.message}`, error.stack ?? "", info.componentStack ?? "");
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden />
        <p className="text-sm font-medium">{translateNow("error.panel.title")}</p>
        {/* The message, on screen, in the user's own words to us: this is what turns "it went
            black" into a report somebody can act on. */}
        <p className="max-w-md break-words font-mono text-xs text-muted-foreground">{error.message}</p>
        <p className="max-w-md text-xs text-muted-foreground">{translateNow("error.panel.body")}</p>
        <Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          {translateNow("error.panel.retry")}
        </Button>
      </div>
    );
  }
}
