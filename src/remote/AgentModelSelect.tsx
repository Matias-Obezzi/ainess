// The one piece of an agent's configuration the phone can change. Its own file rather than a
// block inside RemoteApp so the Agents tab stays a list and this stays testable on its own.
import { useState } from "react";
import { useAppStore } from "@/store";
import { useModelChoices } from "@/hooks/useModelChoices";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/i18n/useT";
import type { AgentConfig } from "@/types";

/** The select's own value for "no model set": the component cannot hold an empty string. */
const NO_MODEL = "none";
/** …and for the row that opens the free-text box below it. */
const CUSTOM_MODEL = "custom";

/**
 * The agent's default model, set from the phone. It used to live only in the desktop settings,
 * which is the wrong place for the one setting you change when you are not at the desk: a quota
 * runs out mid-afternoon and the answer is a cheaper model, not a walk home.
 *
 * Same list as the composer offers — whatever the CLI reports, plus the ids typed by hand before —
 * and no confirmation: it is a select, you pick and it is set.
 */
export function AgentModelSelect({ projectId, agent }: { projectId: string; agent: AgentConfig }) {
  const t = useT();
  const updateAgent = useAppStore(state => state.updateAgent);
  const choices = useModelChoices(agent.provider);
  // A model pinned from the desktop that the CLI no longer lists still has to be shown as what it
  // is, not silently redrawn as the default.
  const known = choices.some(m => m.id === agent.model);
  // What is typed is held here and not read back off the agent: the phone's `updateAgent` is an
  // HTTP call to the PC, so the box would have stayed on its old value until a snapshot came back
  // and swallowed every other keystroke.
  const [typed, setTyped] = useState<string | null>(agent.model && !known ? agent.model : null);
  const value = typed !== null ? CUSTOM_MODEL : !agent.model ? NO_MODEL : known ? agent.model : CUSTOM_MODEL;

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={value}
        onValueChange={v => {
          // "Other…" opens an empty box rather than keeping the model that was set before it,
          // and clears the agent meanwhile: half a model id is not one to run on.
          setTyped(v === CUSTOM_MODEL ? "" : null);
          updateAgent(projectId, agent.id, { model: v === NO_MODEL || v === CUSTOM_MODEL ? undefined : v });
        }}
      >
        <SelectTrigger className="h-10 w-full min-w-0" aria-label={t("composer.pickModel")}>
          <SelectValue placeholder={t("common.model")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_MODEL}>{t("composer.defaultModel")}</SelectItem>
          {choices.map(m => (
            <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
          ))}
          <SelectItem value={CUSTOM_MODEL}>{t("composer.otherModel")}</SelectItem>
        </SelectContent>
      </Select>
      {value === CUSTOM_MODEL && (
        <Input
          className="h-10"
          placeholder={t("composer.typeModel")}
          value={typed ?? agent.model ?? ""}
          onChange={e => {
            setTyped(e.target.value);
            updateAgent(projectId, agent.id, { model: e.target.value.trim() || undefined });
          }}
        />
      )}
    </div>
  );
}
