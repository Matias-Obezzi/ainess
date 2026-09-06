import { useState } from "react";
import { Hook, HookEvent, HookAction } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAppStore, selectAllAgents } from "@/store";

const EVENTS: { value: HookEvent; label: string }[] = [
  { value: "task.started", label: "task.started" },
  { value: "task.finished", label: "task.finished" },
  { value: "task.failed", label: "task.failed" },
  { value: "delegation", label: "delegation" },
  { value: "run.finished", label: "run.finished" },
  { value: "run.failed", label: "run.failed" },
  { value: "agent.stopped", label: "agent.stopped" },
  { value: "result", label: "result" }
];

const ACTIONS = [
  { value: "slack", label: "Slack" },
  { value: "discord", label: "Discord" },
  { value: "webhook", label: "Webhook" },
  { value: "command", label: "Comando Local" },
  { value: "instruct", label: "Instruir Agente" },
  { value: "notify", label: "Notificación" }
];

const PRESET_SLACK = "✅ {{agent}} terminó en {{project}}: {{output|300}}";

export function HookDialog({ open, onClose, hook, onSave }: { open: boolean, onClose: () => void, hook?: Hook, onSave: (h: Hook) => void }) {
  const isEditing = !!hook;
  const store = useAppStore();
  const agents = useAppStore(selectAllAgents);
  const [name, setName] = useState(hook?.name || "");
  const [event, setEvent] = useState<HookEvent>(hook?.event || "task.finished");
  const [enabled, setEnabled] = useState(hook?.enabled ?? true);
  
  const initialActionType = hook?.action.type || "notify";
  const [actionType, setActionType] = useState<string>(initialActionType);
  
  // Action fields
  const [url, setUrl] = useState(hook?.action.type === "slack" || hook?.action.type === "discord" || hook?.action.type === "webhook" ? (hook.action as any).webhookUrl || (hook.action as any).url || "" : "");
  const [template, setTemplate] = useState(
    hook?.action.type === "slack" || hook?.action.type === "discord" || hook?.action.type === "instruct" || hook?.action.type === "notify" ? hook.action.template :
    hook?.action.type === "webhook" ? hook.action.bodyTemplate : PRESET_SLACK
  );
  const [title, setTitle] = useState(hook?.action.type === "notify" ? hook.action.title : "Aviso");
  const [program, setProgram] = useState(hook?.action.type === "command" ? hook.action.program : "");
  const [argsStr, setArgsStr] = useState(hook?.action.type === "command" ? hook.action.args.join(" ") : "");
  const [agentId, setAgentId] = useState(hook?.action.type === "instruct" ? hook.action.agentId : "");
  
  // Filter fields
  const [filterAgentId, setFilterAgentId] = useState(hook?.filter?.agentId || "all");
  const [filterProjectId, setFilterProjectId] = useState(hook?.filter?.projectId || "all");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    let action: HookAction;
    switch (actionType) {
      case "slack": action = { type: "slack", webhookUrl: url, template }; break;
      case "discord": action = { type: "discord", webhookUrl: url, template }; break;
      case "webhook": action = { type: "webhook", url, method: "POST", headers: { "Content-Type": "application/json" }, bodyTemplate: template }; break;
      case "command": 
        const parsedArgs = argsStr.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(a => a.replace(/(^"|"$)/g, "")) || [];
        action = { type: "command", program, args: parsedArgs, cwd: "workspace" }; 
        break;
      case "instruct": action = { type: "instruct", agentId, template }; break;
      case "notify": action = { type: "notify", title, template }; break;
      default: return;
    }

    const newHook: Hook = {
      id: hook?.id || crypto.randomUUID(),
      name,
      event,
      enabled,
      action,
      filter: (filterAgentId !== "all" || filterProjectId !== "all") ? {
        ...(filterAgentId !== "all" ? { agentId: filterAgentId } : {}),
        ...(filterProjectId !== "all" ? { projectId: filterProjectId } : {})
      } : undefined
    };
    onSave(newHook);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#1e1e1e] border-[#333] text-gray-200">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Hook" : "Nuevo Hook"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={name} onChange={e => setName(e.target.value)} required className="bg-[#111] border-[#333]" />
            </div>
            <div className="space-y-2 flex flex-col justify-end">
              <div className="flex items-center space-x-2 pb-2">
                <Switch checked={enabled} onCheckedChange={setEnabled} />
                <Label>Habilitado</Label>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Evento</Label>
              <Select value={event} onValueChange={(v) => setEvent(v as HookEvent)}>
                <SelectTrigger className="bg-[#111] border-[#333] w-full"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#1e1e1e] border-[#333]">
                  {EVENTS.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Acción</Label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger className="bg-[#111] border-[#333] w-full"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#1e1e1e] border-[#333]">
                  {ACTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Filtro: Agente (Opcional)</Label>
              <Select value={filterAgentId} onValueChange={setFilterAgentId}>
                <SelectTrigger className="bg-[#111] border-[#333] w-full"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#1e1e1e] border-[#333]">
                  <SelectItem value="all">Todos</SelectItem>
                  {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Filtro: Proyecto (Opcional)</Label>
              <Select value={filterProjectId} onValueChange={setFilterProjectId}>
                <SelectTrigger className="bg-[#111] border-[#333] w-full"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#1e1e1e] border-[#333]">
                  <SelectItem value="all">Todos</SelectItem>
                  {store.config.projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border border-[#333] p-4 rounded-md space-y-4">
            {(actionType === "slack" || actionType === "discord" || actionType === "webhook") && (
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <Input value={url} onChange={e => setUrl(e.target.value)} required type="url" className="bg-[#111] border-[#333]" />
              </div>
            )}
            
            {actionType === "command" && (
              <>
                <div className="space-y-2">
                  <Label>Comando</Label>
                  <Input value={program} onChange={e => setProgram(e.target.value)} required className="bg-[#111] border-[#333]" />
                </div>
                <div className="space-y-2">
                  <Label>Argumentos (separados por espacio)</Label>
                  <Input value={argsStr} onChange={e => setArgsStr(e.target.value)} className="bg-[#111] border-[#333]" />
                </div>
              </>
            )}

            {actionType === "instruct" && (
              <div className="space-y-2">
                <Label>Agente a instruir</Label>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger className="bg-[#111] border-[#333] w-full"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-[#1e1e1e] border-[#333]">
                    {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {actionType === "notify" && (
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} required className="bg-[#111] border-[#333]" />
              </div>
            )}

            {actionType !== "command" && (
              <div className="space-y-2">
                <Label>Plantilla</Label>
                <Input value={template} onChange={e => setTemplate(e.target.value)} required className="bg-[#111] border-[#333]" />
                <p className="text-xs text-gray-500">Variables: {'{{event}}'}, {'{{project}}'}, {'{{agent}}'}, {'{{output|300}}'}, {'{{error}}'}, {'{{time}}'}...</p>
              </div>
            )}
          </div>
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="ghost" type="button" onClick={onClose} className="text-gray-400 hover:text-white">Cancelar</Button>
            <Button type="submit" className="bg-[#007acc] hover:bg-[#0098ff] text-white">Guardar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
