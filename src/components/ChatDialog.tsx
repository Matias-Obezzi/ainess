import { useState } from "react";
import { useAppStore } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import type { ChatParticipant } from "@/types";
import { PROVIDERS } from "@/lib/providers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editChatId?: string;
}

/** Roles that make sense in a chat; the text lands in the agent's system prompt ("tu rol es …"). */
const CHAT_ROLES = ["asistente", "arquitecto", "revisor de código", "QA", "abogado del diablo", "docente", "product owner", "investigador"];
const OTHER_ROLE = "__other__";
const DEFAULT_MODEL = "__default__";
const OTHER_MODEL = "__other_model__";

export function ChatDialog({ open, onOpenChange, editChatId }: Props) {
  const agents = useAppStore(state => state.config.agents);
  const models = useAppStore(state => state.models);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const chats = useAppStore(state => state.config.chats);
  const createChat = useAppStore(state => state.createChat);
  const updateChat = useAppStore(state => state.updateChat);

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
          <DialogTitle>{editChat ? "Editar chat" : "Nuevo chat"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div>
            <Label>Nombre</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Revisión de código" />
          </div>

          <div>
            <Label>Modo</Label>
            <Select value={participants.length > 1 ? mode : "individual"} onValueChange={(v: "individual" | "shared") => setMode(v)} disabled={participants.length <= 1}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="shared">Compartido</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Participantes</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Con quién hablás directamente, sin pasar por el planificador. Con más de uno, responden por turno y cada uno ve lo que dijeron los otros; el rol le dice a cada agente cómo comportarse en este chat.
            </p>
            <div className="flex flex-col gap-2 mt-2">
              {participants.map((p, idx) => {
                const provider = agents.find(a => a.id === p.agentId)?.provider;
                const modelIds = provider ? (models[provider]?.map(m => m.id) ?? PROVIDERS[provider]?.defaultModels ?? []) : [];
                return (
                  <div key={idx} className="rounded-md border border-border p-2 flex flex-col gap-2">
                    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                      <Select value={p.agentId} onValueChange={v => updateParticipant(idx, { agentId: v, model: undefined })}>
                        <SelectTrigger className="w-full" title="Agente">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={CHAT_ROLES.includes(p.role) ? p.role : OTHER_ROLE}
                        onValueChange={v => updateParticipant(idx, { role: v === OTHER_ROLE ? "" : v })}
                      >
                        <SelectTrigger className="w-full" title="Cómo tiene que comportarse en este chat">
                          <SelectValue placeholder="Rol" />
                        </SelectTrigger>
                        <SelectContent>
                          {CHAT_ROLES.map(r => (
                            <SelectItem key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</SelectItem>
                          ))}
                          <SelectItem value={OTHER_ROLE}>Otro…</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={!p.model ? DEFAULT_MODEL : modelIds.includes(p.model) ? p.model : OTHER_MODEL}
                        onValueChange={v => updateParticipant(idx, { model: v === DEFAULT_MODEL ? undefined : v === OTHER_MODEL ? "custom" : v })}
                      >
                        <SelectTrigger className="w-full" title="Modelo para este agente en este chat">
                          <SelectValue placeholder="Modelo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={DEFAULT_MODEL}>Modelo por defecto</SelectItem>
                          {modelIds.map(m => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                          <SelectItem value={OTHER_MODEL}>Otro…</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={participants.length <= 1}
                        title="Quitar participante"
                        onClick={() => removeParticipant(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {(!CHAT_ROLES.includes(p.role) || (p.model && !modelIds.includes(p.model))) && (
                      <div className="grid grid-cols-2 gap-2">
                        {!CHAT_ROLES.includes(p.role) && (
                          <Input
                            value={p.role}
                            onChange={e => updateParticipant(idx, { role: e.target.value })}
                            placeholder="Describí el rol (ej: experto en Postgres)"
                          />
                        )}
                        {p.model && !modelIds.includes(p.model) && (
                          <Input
                            value={p.model === "custom" ? "" : p.model}
                            onChange={e => updateParticipant(idx, { model: e.target.value || "custom" })}
                            placeholder="Id del modelo"
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <Button variant="outline" size="sm" onClick={addParticipant} disabled={participants.length >= agents.length}>
                <Plus className="h-4 w-4 mr-1" /> Agregar participante
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim() || participants.length === 0}>
            {editChat ? "Guardar" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
