import { useState, useEffect, useCallback, useMemo } from "react";
import { useAppStore, selectProjectAgents, nextAgentName } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentConfig, ProviderId, AgentRole, QuotaItem } from "@/types";
import { availableProviders, defaultAgentDescription, PROVIDERS } from "@/lib/providers";
import { worktreeBranch } from "@/lib/worktree";
import { formatResetsAt } from "@/lib/quota";
import { roleLabelKey } from "@/lib/labels";
import { useT, type TFunction } from "@/i18n/useT";
import { open } from "@tauri-apps/plugin-dialog";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: AgentConfig;
  /**
   * Project the agent belongs to. Defaults to the open one; ignored when `onSave` is given
   * (a formation, or the team a project is about to be created with, has no project yet).
   */
  projectId?: string | null;
  /** The team this agent lives in: parent options and the unique name are checked against it. */
  agents?: AgentConfig[];
  /** When set, the dialog hands the agent back instead of writing it to the project. */
  onSave?: (agent: AgentConfig) => void;
}

const DEFAULT_MODEL_OPTION = "__default__";
const OTHER_MODEL_OPTION = "__other__";

function quotaLine(item: QuotaItem, t: TFunction): { text: string; percent?: number } {
  if (item.unlimited) return { text: t("agentDialog.quotaUnlimited") };
  if (item.entitlement !== undefined && item.remaining !== undefined) {
    const percent = item.percentRemaining ?? Math.round((item.remaining / item.entitlement) * 100);
    return { text: `${item.remaining} / ${item.entitlement} (${Math.round(percent)}%)`, percent };
  }
  if (item.usedPercent !== undefined) {
    return { text: t("quota.usedPercent", { percent: item.usedPercent }), percent: 100 - item.usedPercent };
  }
  return { text: item.note || "" };
}

function QuotaBlock({ provider, initialLoading }: { provider: ProviderId; initialLoading?: boolean }) {
  const t = useT();
  const quotaState = useAppStore(state => state.quota[provider]);
  const refreshQuota = useAppStore(state => state.refreshQuota);
  const [loading, setLoading] = useState(false);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      await refreshQuota(provider);
    } finally {
      setLoading(false);
    }
  }, [provider, refreshQuota]);

  return (
    <Card className="p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="font-semibold text-sm">{t("agentDialog.quotaOf", { provider: PROVIDERS[provider]?.label ?? provider })}</span>
        <Button size="sm" variant="outline" onClick={() => void handleRefresh()} disabled={loading}>
          {loading && <Loader2 className="size-3 mr-1 animate-spin" />}
          {t("agentDialog.quotaRefresh")}
        </Button>
      </div>

      {!quotaState && initialLoading && (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}

      {!quotaState && !initialLoading && (
        <div className="text-sm text-muted-foreground">{t("agentDialog.quotaNoData")}</div>
      )}

      {quotaState && quotaState.status !== "ok" && (
        <div className="text-sm text-muted-foreground">{quotaState.message}</div>
      )}

      {quotaState?.status === "ok" && provider === "antigravity" && (
        <div className="space-y-1">
          {quotaState.items.map(item => (
            <div key={item.label} className="flex justify-between text-sm">
              <span>{item.label}</span>
              <span className="text-muted-foreground">
                {item.resetsAt
                  ? t("agentDialog.quotaExhaustedUntil", { time: formatResetsAt(item.resetsAt) ?? "" })
                  : t("agentDialog.quotaAvailable")}
              </span>
            </div>
          ))}
          <div className="text-xs text-muted-foreground pt-1">
            {t("agentDialog.quotaAntigravityHint")}
          </div>
        </div>
      )}

      {quotaState?.status === "ok" && provider !== "antigravity" && (
        <div className="space-y-2">
          {quotaState.items.map(item => {
            const { text, percent } = quotaLine(item, t);
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{item.label}</span>
                  <span className="text-muted-foreground">{text}</span>
                </div>
                {percent !== undefined && <Progress value={Math.max(0, Math.min(100, percent))} />}
                {item.resetsAt !== undefined && (
                  <div className="text-xs text-muted-foreground">{t("agentDialog.quotaRenews", { time: formatResetsAt(item.resetsAt) ?? "" })}</div>
                )}
              </div>
            );
          })}
          {quotaState.items.length === 0 && <div className="text-sm text-muted-foreground">{t("agentDialog.quotaNoInfo")}</div>}
          {/* A provider that answered but has something to say about what it answered: opencode
              counts what was spent, because the ceiling belongs to the account behind it. */}
          {quotaState.message && <div className="pt-1 text-xs text-muted-foreground">{quotaState.message}</div>}
        </div>
      )}
    </Card>
  );
}

export function AgentDialog({ open: dialogOpen, onOpenChange, agent, projectId, agents: rosterProp, onSave }: Props) {
  const t = useT();
  const config = useAppStore(state => state.config);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const targetProjectId = projectId !== undefined ? projectId : currentProjectId;
  const projectAgents = useAppStore(state => selectProjectAgents(state, targetProjectId));
  const roster = rosterProp ?? projectAgents;
  const addAgent = useAppStore(state => state.addAgent);
  const updateAgent = useAppStore(state => state.updateAgent);
  const binaries = useAppStore(state => state.binaries);
  const models = useAppStore(state => state.models);
  const quotaByProvider = useAppStore(state => state.quota);
  const refreshModels = useAppStore(state => state.refreshModels);
  const refreshQuota = useAppStore(state => state.refreshQuota);
  const detectBinaries = useAppStore(state => state.detectBinaries);
  const updateConfig = useAppStore(state => state.updateConfig);
  // `undefined` while the repo has not been read yet: the switch stays available until we know.
  const projectIsRepo = useAppStore(state => (targetProjectId ? state.repoState[targetProjectId]?.isRepo : undefined));
  const refreshRepoState = useAppStore(state => state.refreshRepoState);
  const approveDelegations = useAppStore(state => state.config.approveDelegations);

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<ProviderId>("claude");
  const [role, setRole] = useState<AgentRole>("implementer");
  const [parentId, setParentId] = useState<string | null>(null);
  const [modelOption, setModelOption] = useState<string>(DEFAULT_MODEL_OPTION);
  const [otherModel, setOtherModel] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [approvalMode, setApprovalMode] = useState<"inherit" | "always" | "never">("inherit");
  const [worktree, setWorktree] = useState(false);
  const [description, setDescription] = useState("");
  /** Once the user writes their own, the default stops following the role and the provider. */
  const [descriptionEdited, setDescriptionEdited] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [customProgram, setCustomProgram] = useState("");
  const [customArgs, setCustomArgs] = useState("");
  const [color, setColor] = useState("#888888");
  const [modelsLoading, setModelsLoading] = useState(false);
  // While the name is still the one the dialog proposed, changing the provider renames it too.
  const [suggestedName, setSuggestedName] = useState("");

  const setModelFromAgent = (providerId: ProviderId, modelValue: string | undefined, availableModels: { id: string }[]) => {
    if (!modelValue) {
      setModelOption(DEFAULT_MODEL_OPTION);
      setOtherModel("");
    } else if (availableModels.some(m => m.id === modelValue) || (PROVIDERS[providerId]?.models || []).some(m => m.id === modelValue)) {
      setModelOption(modelValue);
      setOtherModel("");
    } else {
      setModelOption(OTHER_MODEL_OPTION);
      setOtherModel(modelValue);
    }
  };

  useEffect(() => {
    if (dialogOpen) {
      if (agent) {
        setId(agent.id);
        setName(agent.name);
        setSuggestedName("");
        setProvider(agent.provider);
        setRole(agent.role);
        setParentId(agent.parentId);
        setModelFromAgent(agent.provider, agent.model, models[agent.provider] || []);
        setAutoApprove(agent.autoApprove);
        setApprovalMode(agent.requireApproval === undefined ? "inherit" : agent.requireApproval ? "always" : "never");
        setWorktree(agent.worktree ?? false);
        setDescription(agent.description || "");
        setDescriptionEdited(true);
        setSystemPrompt(agent.systemPrompt || "");
        setCustomProgram(agent.customCommand?.program || "");
        setCustomArgs(agent.customCommand?.args.join(" ") || "");
        setColor(agent.color || "#888888");
      } else {
        // Whatever is installed, preferring Claude Code when it is: starting on a provider that
        // is not here would ask the user to change it before anything else.
        const installed = availableProviders(binaries);
        const first = installed.includes("claude") ? "claude" : (installed[0] ?? "custom");
        const proposed = nextAgentName(roster, PROVIDERS[first].label);
        setId(crypto.randomUUID());
        setName(proposed);
        setSuggestedName(proposed);
        setProvider(first);
        setRole("implementer");
        setParentId(null);
        setModelOption(DEFAULT_MODEL_OPTION);
        setOtherModel("");
        setAutoApprove(false);
        setApprovalMode("inherit");
        setWorktree(false);
        setDescription("");
        setDescriptionEdited(false);
        setSystemPrompt("");
        setCustomProgram("");
        setCustomArgs("");
        setColor("#888888");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, agent]);

  /**
   * A new agent introduces itself. The description is what its planner reads to decide who gets a
   * task, and every way of creating an agent left it empty; this fills it with its role and the
   * CLI behind it, and gets out of the way the moment the user types something of their own.
   *
   * Only with a parent: without one nobody reads it, and the field is not even shown.
   */
  useEffect(() => {
    if (!dialogOpen || descriptionEdited) return;
    setDescription(parentId === null ? "" : defaultAgentDescription(role, provider));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, descriptionEdited, parentId, role, provider]);

  // Whether the project is a git repo decides if the worktree switch is available at all.
  useEffect(() => {
    if (dialogOpen && targetProjectId) void refreshRepoState(targetProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, targetProjectId]);

  // Fetch the model list and quota for the selected provider whenever the dialog is open
  // and the provider changes (covers both opening the dialog and switching providers).
  useEffect(() => {
    if (!dialogOpen || provider === "custom") return;
    setModelsLoading(true);
    void Promise.all([refreshModels(provider), refreshQuota(provider)]).finally(() => setModelsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, provider]);

  // Find valid parents (not self, not descendant)
  const descendants = new Set<string>();
  if (agent) {
    const queue = [agent.id];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      descendants.add(cur);
      const children = roster.filter(a => a.parentId === cur);
      for (const c of children) queue.push(c.id);
    }
  }
  const validParents = roster.filter(a => !descendants.has(a.id));

  /**
   * Two agents of the same provider are fine (a planner Claude and a reviewer Claude); what a
   * delegation resolves is the name, so that is what has to be unique inside the team.
   */
  const duplicateName = roster.some(a => a.id !== id && a.name.trim().toLowerCase() === name.trim().toLowerCase());

  const handleProviderChange = (value: ProviderId) => {
    setProvider(value);
    if (!agent && (name.trim() === "" || name === suggestedName)) {
      const proposed = nextAgentName(roster, PROVIDERS[value]?.label || value);
      setName(proposed);
      setSuggestedName(proposed);
    }
  };

  const resolvedModel = modelOption === DEFAULT_MODEL_OPTION ? undefined : modelOption === OTHER_MODEL_OPTION ? otherModel : modelOption;

  const handleSave = () => {
    const newAgent: AgentConfig = {
      id,
      name,
      provider,
      role,
      parentId,
      model: resolvedModel || undefined,
      autoApprove,
      requireApproval: approvalMode === "inherit" ? undefined : approvalMode === "always",
      worktree: worktree || undefined,
      description: description || undefined,
      systemPrompt: systemPrompt || undefined,
      color
    };
    if (provider === "custom") {
      newAgent.customCommand = {
        program: customProgram,
        args: customArgs.split(" ").filter(s => s.trim() !== "")
      };
    }
    if (onSave) {
      onSave(newAgent);
    } else if (targetProjectId) {
      if (agent) updateAgent(targetProjectId, agent.id, newAgent);
      else addAgent(targetProjectId, newAgent);
    }
    onOpenChange(false);
  };

  const availableModels = models[provider] || PROVIDERS[provider]?.models || [];
  const providerQuota = quotaByProvider[provider];

  const quotaSuffixFor = (modelId: string): string => {
    if (!providerQuota || providerQuota.status !== "ok") return "";
    if (provider === "antigravity") {
      const pool = providerQuota.items.find(i => modelId.startsWith(i.model || "___"));
      if (!pool) return "";
      return pool.resetsAt
        ? ` · ${t("agentDialog.quotaExhaustedShort", { time: formatResetsAt(pool.resetsAt) ?? "" })}`
        : ` · ${t("agentDialog.quotaAvailableShort")}`;
    }
    const item = providerQuota.items.find(i => i.model === modelId);
    if (!item) return "";
    const { text } = quotaLine(item, t);
    return text ? ` · ${text}` : "";
  };

  const handlePickExecutable = async () => {
    const selected = await open({ multiple: false, filters: [{ name: t("agents.executable"), extensions: ["exe", "cmd", "bat"] }] });
    if (selected && typeof selected === "string") {
      const overrides = { ...config.binaryOverrides, [provider]: selected };
      updateConfig({ binaryOverrides: overrides });
      await detectBinaries();
    }
  };

  const handleClearOverride = async () => {
    const overrides = { ...config.binaryOverrides };
    delete overrides[provider];
    updateConfig({ binaryOverrides: overrides });
    await detectBinaries();
  };

  // Only what can run: an agent built on a CLI that is not here would fail on its first run.
  const offered: ProviderId[] = useMemo(() => availableProviders(binaries, provider), [binaries, provider]);
  const hiddenProviders = Object.keys(PROVIDERS).length - offered.length;

  const currentBinary = binaries[provider];
  const hasOverride = !!config.binaryOverrides?.[provider];
  // A worktree needs a repo. A team with no project yet (a formation) keeps the option: the
  // agent carries the setting to whichever project it lands in.
  const isRepo = projectIsRepo !== false;

  return (
    <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{agent ? t("agentActions.editAgent") : t("agentDialog.newAgent")}</DialogTitle>
        </DialogHeader>
        
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
          <div className="flex flex-col gap-4 py-4 px-1">
            <div className="flex gap-4">
              <div className="flex-1 space-y-1">
                <Label>{t("common.name")}</Label>
                <Input value={name} onChange={e => { setName(e.target.value); setSuggestedName(""); }} />
                {duplicateName && (
                  <p className="text-xs text-destructive">{t("agentDialog.duplicateName")}</p>
                )}
              </div>
              <div className="w-20 space-y-1">
                <Label>{t("agentDialog.color")}</Label>
                <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-9 px-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t("agentDialog.provider")}</Label>
                <Select value={provider} onValueChange={v => handleProviderChange(v as ProviderId)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {offered.map(id => (
                      <SelectItem key={id} value={id}>{PROVIDERS[id].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Nothing installed is a dead end, not a note: the only thing left to pick is a
                    command the user has to write, so this says where CLIs come from. */}
                {offered.length === 1 && offered[0] === "custom" ? (
                  <p className="text-xs text-muted-foreground">
                    {t("agentDialog.noneDetected")}{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-foreground"
                      onClick={() => {
                        onOpenChange(false);
                        useAppStore.getState().openSettings("agents");
                      }}
                    >
                      {t("agentDialog.installOne")}
                    </button>
                  </p>
                ) : hiddenProviders > 0 ? (
                  <p className="text-xs text-muted-foreground">{t("agentDialog.onlyDetected")}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label>{t("agentDialog.role")}</Label>
                <Select value={role} onValueChange={v => setRole(v as AgentRole)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(roleLabelKey) as [AgentRole, string][]).map(([r, key]) => (
                      <SelectItem key={r} value={r}>{t(key)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t("agentDialog.parent")}</Label>
                <Select value={parentId || "null"} onValueChange={v => setParentId(v === "null" ? null : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="null">{t("agentDialog.noParent")}</SelectItem>
                    {validParents.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("common.model")}</Label>
                {modelsLoading && availableModels.length === 0 ? (
                  <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                    {t("agentDialog.loadingModels")}
                  </div>
                ) : (
                  <Select value={modelOption} onValueChange={setModelOption}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT_MODEL_OPTION}>{t("agentDialog.providerDefault")}</SelectItem>
                      {availableModels.map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}{m.label !== m.id ? ` (${m.id})` : ""}{quotaSuffixFor(m.id)}
                        </SelectItem>
                      ))}
                      <SelectItem value={OTHER_MODEL_OPTION}>{t("agentDialog.otherModel")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {modelOption === OTHER_MODEL_OPTION && (
                  <Input
                    className="mt-1"
                    value={otherModel}
                    onChange={e => setOtherModel(e.target.value)}
                    placeholder={t("agentDialog.otherModelPlaceholder")}
                  />
                )}
              </div>
            </div>

            {provider !== "custom" && <QuotaBlock provider={provider} initialLoading={modelsLoading} />}

            <div className="flex items-center gap-2">
              <Switch checked={autoApprove} onCheckedChange={setAutoApprove} id="auto-approve" />
              <Label htmlFor="auto-approve">{t("agentDialog.autoApprove")}</Label>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold">{t("agentDialog.approvalMode")}</label>
              <Select value={approvalMode} onValueChange={(val: "inherit" | "always" | "never") => setApprovalMode(val)}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">{t("agentDialog.approvalMode.inherit")}</SelectItem>
                  <SelectItem value="always">{t("agentDialog.approvalMode.always")}</SelectItem>
                  <SelectItem value="never">{t("agentDialog.approvalMode.never")}</SelectItem>
                </SelectContent>
              </Select>
              {approvalMode === "inherit" && (
                <span className="text-sm text-muted-foreground block">
                  {approveDelegations ? t("agentDialog.approvalModeInheritOn") : t("agentDialog.approvalModeInheritOff")}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Switch
                  checked={worktree}
                  onCheckedChange={setWorktree}
                  id="worktree"
                  disabled={!isRepo}
                />
                <Label htmlFor="worktree">{t("agentDialog.worktree")}</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {isRepo
                  ? t("agentDialog.worktreeHint", { branch: worktreeBranch(name || "agente") })
                  : t("agentDialog.notARepo")}
              </p>
            </div>

            {/* The description is what the parent reads to pick who to delegate to: no parent, no field. */}
            {parentId !== null && (
              <div className="space-y-1">
                <Label>{t("agentDialog.description")}</Label>
                <Input
                  value={description}
                  onChange={e => {
                    setDescriptionEdited(true);
                    setDescription(e.target.value);
                  }}
                />
              </div>
            )}

            <div className="space-y-1">
              <Label>{t("agentDialog.systemPrompt")}</Label>
              <Textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} />
            </div>

            {provider === "custom" && (
              <div className="grid grid-cols-2 gap-4 p-4 border rounded">
                <div className="space-y-1">
                  <Label>{t("agentDialog.program")}</Label>
                  <Input value={customProgram} onChange={e => setCustomProgram(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("agentDialog.args")}</Label>
                  <Input value={customArgs} onChange={e => setCustomArgs(e.target.value)} placeholder="agy --prompt {prompt}" />
                </div>
              </div>
            )}

            {provider !== "custom" && (
              <div className="space-y-2 p-3 border rounded">
                <Label>{t("agents.executable")}</Label>
                <div className="text-sm">
                  {currentBinary?.path
                    ? <span>{currentBinary.path}{currentBinary.version ? ` (${currentBinary.version})` : ""}</span>
                    : <span className="text-destructive">{t("agents.notFound")}</span>}
                </div>
                <div className="flex gap-2 items-center">
                  <Button size="sm" variant="outline" onClick={() => void handlePickExecutable()}>{t("agents.setPath")}</Button>
                  {hasOverride && (
                    <Button size="sm" variant="ghost" onClick={() => void handleClearOverride()}>{t("agents.clearOverride")}</Button>
                  )}
                </div>
              </div>
            )}
            
            {agent && (
              <div className="space-y-2 pt-4 border-t">
                <Label>{t("agentDialog.sharedResources")}</Label>
                <div className="text-sm text-muted-foreground flex gap-4">
                  <div className="flex-1">
                    <strong>{t("agentDialog.skills")}</strong>
                    <ul className="list-disc ml-4">
                      {config.skills.filter(s => s.enabledFor === "all" || s.enabledFor.includes(agent.id)).map(s => (
                        <li key={s.id}>{s.name}</li>
                      ))}
                      {config.skills.filter(s => s.enabledFor === "all" || s.enabledFor.includes(agent.id)).length === 0 && <li>{t("common.none")}</li>}
                    </ul>
                  </div>
                  <div className="flex-1">
                    <strong>{t("agentDialog.mcpServers")}</strong>
                    <ul className="list-disc ml-4">
                      {config.mcpServers.filter(s => s.enabledFor === "all" || s.enabledFor.includes(agent.id)).map(s => (
                        <li key={s.id}>{s.name}</li>
                      ))}
                      {config.mcpServers.filter(s => s.enabledFor === "all" || s.enabledFor.includes(agent.id)).length === 0 && <li>{t("common.none")}</li>}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={!name.trim() || duplicateName || (!onSave && !targetProjectId)}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
