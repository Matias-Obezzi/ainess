import { useAppStore, selectAllAgents } from "@/store";
import { confirmDelete } from "@/lib/confirm";
import type { ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkillDialog } from "@/components/SkillDialog";
import { SuggestedDialog } from "@/components/settings/SuggestedDialog";
import { Skill } from "@/types";
import { Sparkles } from "lucide-react";
import { createDialogContext, createToggleContext } from "@/components/settings/section-context";

const SkillDialogCtx = createDialogContext<Skill>();
const SuggestedCtx = createToggleContext();

export function SkillsSectionProvider({ children }: { children: ReactNode }) {
  return (
    <SkillDialogCtx.Provider>
      <SuggestedCtx.Provider>{children}</SuggestedCtx.Provider>
    </SkillDialogCtx.Provider>
  );
}

export function SkillsSectionActions() {
  const { openCreate } = SkillDialogCtx.useDialogState();
  const { show } = SuggestedCtx.useToggleState();
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={show}>
        <Sparkles className="mr-1 size-4" /> Sugeridos
      </Button>
      <Button size="sm" onClick={openCreate}>Nueva skill</Button>
    </div>
  );
}

export function SkillsSection() {
  const config = useAppStore(state => state.config);
  const agents = useAppStore(selectAllAgents);
  const removeSkill = useAppStore(state => state.removeSkill);
  const { open, editing, openEdit, close } = SkillDialogCtx.useDialogState();
  const { open: suggestedOpen, hide: hideSuggested, show: showSuggested } = SuggestedCtx.useToggleState();

  const dialogs = (
    <>
      <SkillDialog open={open} onOpenChange={(o) => !o && close()} skill={editing} />
      <SuggestedDialog kind="skill" open={suggestedOpen} onOpenChange={(o) => (o ? showSuggested() : hideSuggested())} />
    </>
  );

  if (config.skills.length === 0) {
    return (
      <>
        <EmptyState
          icon={Sparkles}
          title="Todavía no hay skills"
          description="Agregá una skill o elegí una sugerida para darle instrucciones reutilizables a los agentes."
          action={{ label: "Agregar sugerida", onClick: showSuggested }}
        />
        {dialogs}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {config.skills.map(skill => (
          <Card key={skill.id}>
            <CardHeader>
              <CardTitle>{skill.name}</CardTitle>
              {skill.description && <CardDescription>{skill.description}</CardDescription>}
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {skill.enabledFor === "all" ? (
                  <Badge variant="secondary">Todos</Badge>
                ) : (
                  skill.enabledFor.map(id => {
                    const agent = agents.find(a => a.id === id);
                    return <Badge key={id} variant="outline">{agent?.name || id}</Badge>;
                  })
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(skill)}>Editar</Button>
              <Button variant="destructive" size="sm" onClick={() => void confirmDelete("la skill", skill.name).then(ok => ok && removeSkill(skill.id))}>Eliminar</Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      {dialogs}
    </div>
  );
}
