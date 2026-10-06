import { useMemo } from "react";
import { useAppStore } from "@/store";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { useT } from "@/i18n/useT";

/**
 * Which agents something is enabled for, across every project. Each one is named with its
 * project because the names repeat: every project has its own planner, and a row of "Planner"
 * buttons — or a "Planner" tag — said nothing about which one was which.
 */
export function AgentPicker({ value, onValueChange }: { value: string[]; onValueChange: (ids: string[]) => void }) {
  const t = useT();
  const projects = useAppStore(state => state.config.projects);
  const options = useMemo<MultiSelectOption[]>(
    () => projects.flatMap(p => (p.agents ?? []).map(a => ({ value: a.id, label: `${a.name} · ${p.name}`, keywords: [a.provider] }))),
    [projects],
  );
  // Only what is about agents: the rest of the picker's words come from the app's LabelsProvider.
  const labels = useMemo(
    () => ({ placeholder: t("agentPicker.placeholder"), search: t("agentPicker.search"), empty: t("agentPicker.empty") }),
    [t],
  );
  return (
    <MultiSelect
      options={options}
      value={value}
      onValueChange={onValueChange}
      // "All agents" is the switch above, which also covers the ones created later.
      selectAll={false}
      labels={labels}
      className="w-full"
    />
  );
}
