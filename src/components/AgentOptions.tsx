// The agents of every project as options of one select, kept under the name of the project each
// belongs to. Two projects can both have an "Orchestrator", and a flat list said nothing about
// which was which.
import { SelectGroup, SelectItem, SelectLabel } from "@/components/ui/select";
import { ProviderLogo } from "@/components/ProviderLogo";
import type { AgentConfig, Project } from "@/types";

export function AgentOptions({ groups }: { groups: { project: Project; agents: AgentConfig[] }[] }) {
  // One project: its name would be a heading over the only group there is.
  const heading = groups.length > 1;

  return (
    <>
      {groups.map(({ project, agents }) => (
        <SelectGroup key={project.id}>
          {heading && (
            <SelectLabel className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: project.color || "#4f8cff" }}
              />
              {project.name}
            </SelectLabel>
          )}
          {agents.map(agent => (
            <SelectItem key={agent.id} value={agent.id}>
              <span className="inline-flex items-center gap-1.5">
                <ProviderLogo provider={agent.provider} size={14} />
                {agent.name}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  );
}
