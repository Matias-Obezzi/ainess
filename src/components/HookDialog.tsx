import { useState } from "react";
import { Hook, HookEvent, HookAction } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TemplateInput } from "@/components/ui/template-input";
import { TEMPLATE_VARS } from "@/lib/template-vars";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProviderLogo } from "@/components/ProviderLogo";
import { Switch } from "@/components/ui/switch";
import { useAppStore, selectAgentsByProject } from "@/store";
import { AgentOptions } from "@/components/AgentOptions";
import { BOSS_TARGET } from "@/lib/team";
import { useT, type TFunction } from "@/i18n/useT";

const EVENTS: { value: HookEvent; label: string }[] = [
  { value: "task.started", label: "task.started" },
  { value: "task.finished", label: "task.finished" },
  { value: "task.failed", label: "task.failed" },
  { value: "delegation", label: "delegation" },
  { value: "approval.requested", label: "approval.requested" },
  { value: "run.finished", label: "run.finished" },
  { value: "run.failed", label: "run.failed" },
  { value: "agent.stopped", label: "agent.stopped" },
  { value: "result", label: "result" },
  { value: "question.asked", label: "question.asked" },
  { value: "review.changes", label: "review.changes" },
  { value: "quota.exhausted", label: "quota.exhausted" },
  // The machine's own conditions (src/lib/system-hooks.ts).
  { value: "app.started", label: "app.started" },
  { value: "schedule", label: "schedule" },
  { value: "internet.lost", label: "internet.lost" },
  { value: "internet.back", label: "internet.back" },
  { value: "file.changed", label: "file.changed" },
];

/**
 * What the one "applies to" field carries, both ways. An agent belongs to exactly one project, so
 * a hook filtered to an agent is already filtered to its project: there is nothing to lose here.
 */
export function scopeOf(hook?: Hook): string {
  if (hook?.filter?.agentId) return `agent:${hook.filter.agentId}`;
  if (hook?.filter?.projectId) return `project:${hook.filter.projectId}`;
  return "all";
}

export function filterOf(scope: string): Hook["filter"] {
  if (scope.startsWith("agent:")) return { agentId: scope.slice("agent:".length) };
  if (scope.startsWith("project:")) return { projectId: scope.slice("project:".length) };
  return undefined;
}

/** The ones with no agent behind them: their project is whatever the filter says, or the open one. */
const SYSTEM_EVENTS: HookEvent[] = ["app.started", "schedule", "internet.lost", "internet.back", "file.changed"];

const ACTIONS = [
  { value: "slack", labelKey: "hookDialog.action.slack" },
  { value: "discord", labelKey: "hookDialog.action.discord" },
  { value: "telegram", labelKey: "hookDialog.action.telegram" },
  { value: "webhook", labelKey: "hookDialog.action.webhook" },
  { value: "command", labelKey: "hookDialog.action.command" },
  { value: "instruct", labelKey: "hookDialog.action.instruct" },
  { value: "notify", labelKey: "hookDialog.action.notify" }
];

/**
 * The message a hook starts with, per event and in the user's language.
 *
 * There used to be one preset for all seventeen, hardcoded in Spanish and written for
 * `run.finished`: a hook on `internet.lost` opened saying an agent had finished, which is not what
 * happened, and said it in Spanish to everyone. Every event now starts with its own line, using the
 * variables that event actually carries.
 */
function presetFor(t: TFunction, event: HookEvent): string {
  return t(`hookPreset.${event}`);
}

export function HookDialog({ open, onClose, hook, onSave }: { open: boolean, onClose: () => void, hook?: Hook, onSave: (h: Hook) => void }) {
  const t = useT();
  const isEditing = !!hook;
  const byProject = useAppStore(selectAgentsByProject);
  const [name, setName] = useState(hook?.name || "");
  const [event, setEvent] = useState<HookEvent>(hook?.event || "task.finished");
  const [enabled, setEnabled] = useState(hook?.enabled ?? true);
  
  const initialActionType = hook?.action.type || "notify";
  const [actionType, setActionType] = useState<string>(initialActionType);
  
  const config = useAppStore(state => state.config);
  const hasTelegramToken = Boolean(config.messaging?.telegram?.token?.trim());
  const [chatId, setChatId] = useState(hook?.action.type === "telegram" ? hook.action.chatId || "" : "");

  // Action fields
  // Asked per type instead of through a cast: the three actions that carry an address do not call it
  // the same thing, and the union already says which one has which.
  const [url, setUrl] = useState(
    hook?.action.type === "slack" || hook?.action.type === "discord" ? hook.action.webhookUrl :
    hook?.action.type === "webhook" ? hook.action.url : ""
  );
  const [template, setTemplate] = useState(
    hook?.action.type === "slack" || hook?.action.type === "discord" || hook?.action.type === "telegram" || hook?.action.type === "instruct" || hook?.action.type === "notify" ? hook.action.template :
    hook?.action.type === "webhook" ? hook.action.bodyTemplate : presetFor(t, hook?.event ?? "task.finished")
  );
  // Once the message is yours, changing the event stops rewriting it. A hook being edited counts as
  // yours from the start: whatever is in there was written on purpose, even if it matches a preset.
  const [templateEdited, setTemplateEdited] = useState(isEditing);
  const [title, setTitle] = useState(hook?.action.type === "notify" ? hook.action.title : t("hookDialog.defaultNotifyTitle"));
  const [program, setProgram] = useState(hook?.action.type === "command" ? hook.action.program : "");
  const [argsStr, setArgsStr] = useState(hook?.action.type === "command" ? hook.action.args.join(" ") : "");
  const [agentId, setAgentId] = useState(hook?.action.type === "instruct" ? hook.action.agentId : "");
  
  // When a "schedule" hook fires: a time of day, or every so many minutes.
  const [scheduleKind, setScheduleKind] = useState<"at" | "every">(hook?.schedule?.at ? "at" : "every");
  const [scheduleAt, setScheduleAt] = useState(hook?.schedule?.at ?? "09:00");
  const [scheduleEvery, setScheduleEvery] = useState(String(hook?.schedule?.everyMinutes ?? 30));

  // What the hook is about: everything, one project, or one agent. An agent implies its project,
  // so the two old fields could only ever agree or cancel each other out.
  const [scope, setScope] = useState(scopeOf(hook));
  const systemEvent = SYSTEM_EVENTS.includes(event);

  /**
   * Nothing an agent did sets off a machine event, so a filter on an agent could only ever mean
   * "never fire" — the hook was saved and then silently did nothing. Switching to one of those
   * events falls back to that agent's project, which is what the filter was really narrowing.
   */
  const chooseEvent = (next: HookEvent) => {
    setEvent(next);
    if (!templateEdited) setTemplate(presetFor(t, next));
    if (!SYSTEM_EVENTS.includes(next) || !scope.startsWith("agent:")) return;
    const agentId = scope.slice("agent:".length);
    const owner = byProject.find(g => g.agents.some(a => a.id === agentId));
    setScope(owner ? `project:${owner.project.id}` : "all");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    let action: HookAction;
    switch (actionType) {
      case "slack": action = { type: "slack", webhookUrl: url, template }; break;
      case "discord": action = { type: "discord", webhookUrl: url, template }; break;
      case "telegram": action = { type: "telegram", template, ...(chatId.trim() ? { chatId: chatId.trim() } : {}) }; break;
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
      ...(event === "schedule"
        ? {
            schedule: scheduleKind === "at"
              ? { at: scheduleAt }
              : { everyMinutes: Math.max(1, Number(scheduleEvery) || 30) },
          }
        : {}),
      filter: filterOf(scope)
    };
    onSave(newHook);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? t("hookDialog.edit") : t("hooks.new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("common.name")}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="space-y-2 flex flex-col justify-end">
              <div className="flex items-center space-x-2 pb-2">
                <Switch checked={enabled} onCheckedChange={setEnabled} />
                <Label>{t("hookDialog.enabled")}</Label>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("hookDialog.event")}</Label>
              <Select value={event} onValueChange={(v) => chooseEvent(v as HookEvent)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENTS.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("hookDialog.actionLabel")}</Label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIONS.map(a => <SelectItem key={a.value} value={a.value}>{t(a.labelKey)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Only a clock needs to be told when. */}
          {event === "schedule" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("hookDialog.when")}</Label>
                <Select value={scheduleKind} onValueChange={(v) => setScheduleKind(v as "at" | "every")}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="at">{t("hookDialog.when.at")}</SelectItem>
                    <SelectItem value="every">{t("hookDialog.when.every")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{scheduleKind === "at" ? t("hookDialog.when.atLabel") : t("hookDialog.when.everyLabel")}</Label>
                {scheduleKind === "at" ? (
                  <Input type="time" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} />
                ) : (
                  <Input type="number" min={1} value={scheduleEvery} onChange={e => setScheduleEvery(e.target.value)} />
                )}
              </div>
            </div>
          )}

          {/* What the machine's own events can and cannot do. */}
          {systemEvent && (
            <p className="text-xs text-muted-foreground">{t("hookDialog.systemEventHint")}</p>
          )}

          {/* One field, not two: an agent belongs to one project, so picking it said the project
              too and the pair only ever asked the same thing twice.

              This one says what sets the hook off; the action below says who hears about it. On a
              machine event nothing sets it off but the machine, so there are no agents to pick
              from here and the only agent field on screen is the one in the action. */}
          <div className="space-y-2">
            <Label>{t("hookDialog.filter")}</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("hookDialog.filter.everything")}</SelectItem>
                {systemEvent
                  ? byProject.map(({ project }) => (
                      <SelectItem key={project.id} value={`project:${project.id}`}>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: project.color || "#4f8cff" }}
                          />
                          {project.name}
                        </span>
                      </SelectItem>
                    ))
                  : byProject.map(({ project, agents: projectAgents }) => (
                      <SelectGroup key={project.id}>
                        <SelectLabel className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: project.color || "#4f8cff" }}
                          />
                          {project.name}
                        </SelectLabel>
                        <SelectItem value={`project:${project.id}`}>{t("hookDialog.filter.wholeProject")}</SelectItem>
                        {projectAgents.map(a => (
                          <SelectItem key={a.id} value={`agent:${a.id}`}>
                            <span className="inline-flex items-center gap-1.5">
                              <ProviderLogo provider={a.provider} size={14} />
                              {a.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border border-border p-4 rounded-md space-y-4">
            {(actionType === "slack" || actionType === "discord" || actionType === "webhook") && (
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <Input value={url} onChange={e => setUrl(e.target.value)} required type="url" />
              </div>
            )}
            
            {actionType === "telegram" && (
              <>
                {!hasTelegramToken && (
                  <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                    {t("hooks.telegramNoToken")}
                  </div>
                )}
                <div className="space-y-2">
                  <Label>{t("hooks.telegramChatId")}</Label>
                  <Input
                    value={chatId}
                    onChange={e => setChatId(e.target.value)}
                    placeholder="123456789"
                  />
                  <p className="text-xs text-muted-foreground">{t("hooks.telegramChatIdHint")}</p>
                </div>
              </>
            )}
            
            {actionType === "command" && (
              <>
                <div className="space-y-2">
                  <Label>{t("hookDialog.command")}</Label>
                  <Input value={program} onChange={e => setProgram(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>{t("hookDialog.args")}</Label>
                  <TemplateInput value={argsStr} onChange={setArgsStr} />
                </div>
              </>
            )}

            {actionType === "instruct" && (
              <div className="space-y-2">
                <Label>{t("hookDialog.agentToInstruct")}</Label>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {/* Not an agent: whoever is on top when the hook fires. */}
                    <SelectItem value={BOSS_TARGET}>{t("hookDialog.theBoss")}</SelectItem>
                    <AgentOptions groups={byProject} />
                  </SelectContent>
                </Select>
                {agentId === BOSS_TARGET && (
                  <p className="text-xs text-muted-foreground">
                    {scope === "all" ? t("hookDialog.theBoss.everyProject") : t("hookDialog.theBoss.hint")}
                  </p>
                )}
              </div>
            )}

            {actionType === "notify" && (
              <div className="space-y-2">
                <Label>{t("hookDialog.title")}</Label>
                <TemplateInput value={title} onChange={setTitle} required />
              </div>
            )}

            {actionType !== "command" && (
              <div className="space-y-2">
                <Label>{t("hookDialog.template")}</Label>
                <TemplateInput
                  value={template}
                  onChange={next => { setTemplateEdited(true); setTemplate(next); }}
                  required
                />
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {t("hookDialog.variables")}
                  {TEMPLATE_VARS.map(v => (
                    <code key={v} title={t(`templateVar.${v}`)} className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">{`{{${v}}}`}</code>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t("hookDialog.variablesHint")}</p>
              </div>
            )}
          </div>
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="ghost" type="button" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit">{t("common.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
