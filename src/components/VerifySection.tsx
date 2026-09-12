import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjectCommands } from "@/hooks/useProjectCommands";
import { splitCommandLine } from "@/lib/verify-commands";
import { useT } from "@/i18n/useT";
import type { VerifyCommand } from "@/types";
import { Plus, Trash2 } from "lucide-react";

/**
 * What a project calls "done", edited as one line each.
 *
 * The line is split here, in front of the user, and the pieces are shown underneath: a command is
 * stored as a program and its arguments because that is how it is spawned, and a person typing
 * `npm test` should be able to see that the app read it as two words and not as a sentence to hand
 * to a shell. Anything that only means something to a shell is refused with a reason rather than
 * quietly escaped — see `lib/verify-commands.ts`.
 */
export function VerifySection({
  workspaceDir,
  commands,
  onChange,
}: {
  workspaceDir: string;
  commands: VerifyCommand[];
  onChange: (next: VerifyCommand[]) => void;
}) {
  const t = useT();
  const detected = useProjectCommands(workspaceDir || undefined);

  /** The ones worth offering: a project has twenty scripts and four of them say whether it works. */
  const suggestions = useMemo(() => {
    const wanted = ["test", "lint", "typecheck", "check", "build"];
    return detected
      .filter(c => wanted.includes(c.label))
      .filter(c => !commands.some(v => v.label === c.label));
  }, [detected, commands]);

  const add = (label: string, text: string) => {
    if (!text.trim()) {
      onChange([
        ...commands,
        { id: crypto.randomUUID(), label, program: "", args: [] },
      ]);
      return;
    }
    const { tokens, problem } = splitCommandLine(text);
    if (problem) return;
    onChange([
      ...commands,
      { id: crypto.randomUUID(), label, program: tokens[0], args: tokens.slice(1) },
    ]);
  };

  const edit = (id: string, patch: Partial<VerifyCommand>) => {
    onChange(commands.map(c => (c.id === id ? { ...c, ...patch } : c)));
  };

  return (
    <div className="space-y-2">
      <Label>{t("verify.title")}</Label>
      <p className="text-xs text-muted-foreground">{t("verify.hint")}</p>

      {commands.map(command => (
        <VerifyRow
          key={command.id}
          command={command}
          onLabel={label => edit(command.id, { label })}
          onCommand={text => {
            const { tokens, problem } = splitCommandLine(text);
            // Kept as typed while it is being typed: refusing mid-word would make the field
            // impossible to edit. What is stored is the split, and the row says when it is not one.
            if (problem) {
              edit(command.id, { program: text, args: [] });
              return;
            }
            edit(command.id, { program: tokens[0], args: tokens.slice(1) });
          }}
          onRemove={() => onChange(commands.filter(c => c.id !== command.id))}
        />
      ))}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => add(t("verify.newLabel"), "")}
        >
          <Plus className="size-3.5" />
          {t("verify.add")}
        </Button>
        {suggestions.map(s => (
          <Button
            key={s.id}
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => add(s.label, s.command)}
          >
            <Plus className="size-3.5" />
            {s.command}
          </Button>
        ))}
      </div>
    </div>
  );
}

function VerifyRow({
  command,
  onLabel,
  onCommand,
  onRemove,
}: {
  command: VerifyCommand;
  onLabel: (label: string) => void;
  onCommand: (text: string) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const text = [command.program, ...command.args].join(" ");
  const { tokens, problem, operator } = splitCommandLine(text);

  const reason =
    problem === "shell-operator" ? t("verify.problem.shellOperator", { op: operator ?? "" })
    : problem === "unbalanced-quote" ? t("verify.problem.unbalancedQuote")
    : problem === "empty" ? t("verify.problem.empty")
    : null;

  return (
    <div className="space-y-1 rounded-md border border-border p-2">
      <div className="flex items-center gap-2">
        <Input
          className="w-40"
          value={command.label}
          onChange={e => onLabel(e.target.value)}
          placeholder={t("verify.labelPlaceholder")}
        />
        <Input
          value={text}
          onChange={e => onCommand(e.target.value)}
          placeholder={t("verify.commandPlaceholder")}
        />
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={t("verify.remove")}>
          <Trash2 className="size-4" />
        </Button>
      </div>
      {reason ? (
        <p className="text-xs text-destructive">{reason}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("verify.willRun", { tokens: tokens.join("  ·  ") })}
        </p>
      )}
    </div>
  );
}
