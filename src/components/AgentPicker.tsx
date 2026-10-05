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
  return (
    <MultiSelect
      options={options}
      value={value}
      onValueChange={onValueChange}
      // "All agents" is the switch above, which also covers the ones created later.
      selectAll={false}
      placeholder={t("agentPicker.placeholder")}
      searchPlaceholder={t("agentPicker.search")}
      emptyText={t("agentPicker.empty")}
      clearLabel={t("agentPicker.clear")}
      removeLabel={name => t("agentPicker.remove", { name })}
      summaryLabel={names => (names.length ? t("agentPicker.summary", { count: names.length, names: names.join(", ") }) : t("common.none"))}
      className="w-full"
    />
  );
}
