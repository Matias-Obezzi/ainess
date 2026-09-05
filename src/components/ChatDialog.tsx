import { useState } from "react";
import { useAppStore } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import type { ChatParticipant } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editChatId?: string;
}

export function ChatDialog({ open, onOpenChange, editChatId }: Props) {
  const agents = useAppStore(state => state.config.agents);
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
    if (editChat) {
      updateChat(editChat.id, { name, participants });
    } else {
      createChat({ projectId: currentProjectId, name, mode: effectiveMode, participants });
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
            <div className="flex flex-col gap-2 mt-2">
              {participants.map((p, idx) => {
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <Select value={p.agentId} onValueChange={v => updateParticipant(idx, { agentId: v })}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="flex-1"
                      value={p.role}
                      onChange={e => updateParticipant(idx, { role: e.target.value })}
                      placeholder="Rol (ej: arquitecto)"
                    />
                    <Input
                      className="w-[120px]"
                      value={p.model || ""}
                      onChange={e => updateParticipant(idx, { model: e.target.value || undefined })}
                      placeholder="Modelo"
                    />
                    {participants.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeParticipant(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
