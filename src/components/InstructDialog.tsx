import { useState } from "react";
import { useAppStore } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  agentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isWorking: boolean;
}

export function InstructDialog({ agentId, open, onOpenChange, isWorking }: Props) {
  const [text, setText] = useState("");
  const instructAgent = useAppStore(state => state.instructAgent);
  const currentProjectId = useAppStore(state => state.currentProjectId);

  const handleSend = () => {
    if (!text.trim() || !currentProjectId) return;
    void instructAgent(agentId, text, currentProjectId);
    setText("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Indicar instrucción</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <Textarea 
            value={text} 
            onChange={e => setText(e.target.value)} 
            placeholder="Instrucción extra..."
          />
          {isWorking && (
            <div className="text-xs text-yellow-600 dark:text-yellow-500">
              Se enviará cuando termine la tarea actual.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={!text.trim()}>Enviar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
