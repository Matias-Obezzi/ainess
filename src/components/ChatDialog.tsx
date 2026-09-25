import { useState } from "react";
import { useAppStore, selectProjectAgents } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import type { ChatParticipant, AgentConfig } from "@/types";
import { useT } from "@/i18n/useT";
import { useCurrentProjectId } from "@/components/shell/project-pane";
import { useModelChoices } from "@/hooks/useModelChoices";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editChatId?: string;
}

/**
 * Roles that make sense in a chat. The value is what lands in the agent's system prompt
 * ("tu rol es …") and is stored as such; only the label the user reads is translated.
 */
const CHAT_ROLES = ["asistente", "arquitecto", "revisor de código", "QA", "abogado del diablo", "docente", "product owner", "investigador"];

const CHAT_ROLE_KEY: Record<string, string> = {
  "asistente": "chat.role.assistant",
  "arquitecto": "chat.role.architect",
  "revisor de código": "chat.role.codeReviewer",
  "QA": "chat.role.qa",
  "abogado del diablo": "chat.role.devilsAdvocate",
  "docente": "chat.role.teacher",
  "product owner": "chat.role.productOwner",
  "investigador": "chat.role.researcher",
};
const OTHER_ROLE = "__other__";
const DEFAULT_MODEL = "__default__";
const OTHER_MODEL = "__other_model__";

function ParticipantRow({
  participant,
  agents,
  canRemove,
  onUpdate,
  onRemove,
}: {
  participant: ChatParticipant;
  agents: AgentConfig[];
  canRemove: boolean;
  onUpdate: (patch: Partial<ChatParticipant>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const provider = agents.find(a => a.id === participant.agentId)?.provider;
  const modelChoices = useModelChoices(provider);
  const modelIds = modelChoices.map(m => m.id);

  return (
    <div className="rounded-md border border-border p-2 flex flex-col gap-2">
      {/* `1fr` is `minmax(auto, 1fr)`: a column refuses to go under the width of what it holds,
          so a model with a long name stretched the row, the row stretched the dialog, and the
          fields above it hung out of the card. `minmax(0, 1fr)` lets the three columns shrink
          and the value clamp. */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-center">
        <Select value={participant.agentId} onValueChange={v => onUpdate({ agentId: v, model: undefined })}>
          <SelectTrigger className="w-full min-w-0" title={t("chatDialog.agent")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {agents.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={CHAT_ROLES.includes(participant.role) ? participant.role : OTHER_ROLE}
          onValueChange={v => onUpdate({ role: v === OTHER_ROLE ? "" : v })}
        >
          <SelectTrigger className="w-full min-w-0" title={t("chatDialog.roleHint")}>
            <SelectValue placeholder={t("chatDialog.role")} />
          </SelectTrigger>
          <SelectContent>
            {CHAT_ROLES.map(r => (
              <SelectItem key={r} value={r}>{t(CHAT_ROLE_KEY[r])}</SelectItem>
            ))}
            <SelectItem value={OTHER_ROLE}>{t("composer.otherModel")}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={!participant.model ? DEFAULT_MODEL : modelIds.includes(participant.model) ? participant.model : OTHER_MODEL}
          onValueChange={v => onUpdate({ model: v === DEFAULT_MODEL ? undefined : v === OTHER_MODEL ? "custom" : v })}
        >
          <SelectTrigger className="w-full min-w-0" title={t("chatDialog.modelHint")}>
            <SelectValue placeholder={t("common.model")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_MODEL}>{t("composer.defaultModel")}</SelectItem>
            {modelChoices.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
            ))}
            <SelectItem value={OTHER_MODEL}>{t("composer.otherModel")}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={!canRemove}
          title={t("chatDialog.removeParticipant")}
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {(!CHAT_ROLES.includes(participant.role) || (participant.model && !modelIds.includes(participant.model))) && (
        <div className="grid grid-cols-2 gap-2">
          {!CHAT_ROLES.includes(participant.role) && (
            <Input
              value={participant.role}
              onChange={e => onUpdate({ role: e.target.value })}
              placeholder={t("chatDialog.customRolePlaceholder")}
            />
          )}
          {participant.model && !modelIds.includes(participant.model) && (
            <Input
              value={participant.model === "custom" ? "" : participant.model}
              onChange={e => onUpdate({ model: e.target.value || "custom" })}
              placeholder={t("chatDialog.modelIdPlaceholder")}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function ChatDialog({ open, onOpenChange, editChatId }: Props) {
  const t = useT();
  const currentProjectId = useCurrentProjectId();
  const agents = useAppStore(state => selectProjectAgents(state, currentProjectId));
  const chats = useAppStore(state => state.config.chats);
  const createChat = useAppStore(state => state.createChat);
  const updateChat = useAppStore(state => state.updateChat);
  const rememberModel = useAppStore(state => state.rememberModel);

  const editChat = editChatId ? chats.find(c => c.id === editChatId) : undefined;

  const [name, setName] = useState(editChat?.name || "");
  const [mode, setMode] = useState<"individual" | "shared">(editChat?.mode || "individual");
  const [participants, setParticipants] = useState<ChatParticipant[]>(
    editChat?.participants || (agents.length > 0 ? [{ agentId: agents[0].id, role: "asistente" }] : [])
  );

  const addParticipant = () => {
    const available = agents.find(a => !participants.some(p => p.agentId === a.id));
    if (available) {
      setParticipants([...participants, { agentId: available.id, role: "asistente" }]);
      if (participants.length === 0) setMode("individual");
      else setMode("shared");
    }
  };

  const removeParticipant = (idx: number) => {
    setParticipants(participants.filter((_, i) => i !== idx));
  };

  const updateParticipant = (idx: number, patch: Partial<ChatParticipant>) => {
    setParticipants(participants.map((p, i) => i === idx ? { ...p, ...patch } : p));
  };

  const handleSave = () => {
    if (!name.trim() || participants.length === 0 || !currentProjectId) return;
    const effectiveMode = participants.length === 1 ? "individual" : mode;
    const cleaned = participants.map(p => ({ ...p, model: p.model === "custom" ? undefined : p.model }));
    for (const p of participants) {
      if (p.model && p.model !== "custom" && p.model.trim()) {
        const agent = agents.find(a => a.id === p.agentId);
        if (agent) {
          rememberModel(agent.provider, p.model);
        }
      }
    }
    if (editChat) {
      updateChat(editChat.id, { name, participants: cleaned });
    } else {
      createChat({ projectId: currentProjectId, name, mode: effectiveMode, participants: cleaned });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editChat ? t("chat.edit") : t("sidebar.newChat")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div>
            <Label>{t("common.name")}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={t("chatDialog.namePlaceholder")} />
          </div>

          <div>
            <Label>{t("chatDialog.mode")}</Label>
            <Select value={participants.length > 1 ? mode : "individual"} onValueChange={(v: "individual" | "shared") => setMode(v)} disabled={participants.length <= 1}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">{t("chat.individual")}</SelectItem>
                <SelectItem value="shared">{t("chat.shared")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("chatDialog.participants")}</Label>
            <p className="text-xs text-muted-foreground mt-1">{t("chatDialog.participantsHint")}</p>
            <div className="flex flex-col gap-2 mt-2">
              {participants.map((p, idx) => (
                <ParticipantRow
                  key={idx}
                  participant={p}
                  agents={agents}
                  canRemove={participants.length > 1}
                  onUpdate={patch => updateParticipant(idx, patch)}
                  onRemove={() => removeParticipant(idx)}
                />
              ))}
              <Button variant="outline" size="sm" onClick={addParticipant} disabled={participants.length >= agents.length}>
                <Plus className="h-4 w-4 mr-1" /> {t("chatDialog.addParticipant")}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={!name.trim() || participants.length === 0}>
            {editChat ? t("common.save") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
