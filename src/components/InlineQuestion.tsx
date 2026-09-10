// A question an agent asked, answered where it was asked.
//
// An agent that needed the user to decide had two ways out: guess, or end its run with a paragraph
// asking and hope somebody read it. It can put an `ask` block in its answer now, and this is what
// that turns into: the options as buttons, room to write one of your own, and the agent carries on
// in the same session with what was chosen.
import { useState } from "react";
import { MessageCircleQuestion, Send } from "lucide-react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/useT";
import { cn } from "@/lib/utils";

export function InlineQuestion({ questionId, size = "sm" }: { questionId: string; size?: "sm" | "md" }) {
  const t = useT();
  const question = useAppStore(state => state.questions[questionId]);
  const answerQuestion = useAppStore(state => state.answerQuestion);
  const [chosen, setChosen] = useState<string[]>([]);
  const [other, setOther] = useState("");

  if (!question) return null;

  const isMd = size === "md";

  if (question.status === "answered") {
    const answer = (question.answer ?? []).join(", ");
    return (
      <p className={cn("text-muted-foreground", isMd ? "mt-2 text-sm" : "mt-1.5 text-xs")}>
        {t(question.auto ? "questions.answeredAuto" : "questions.answered", { answer })}
      </p>
    );
  }

  const pick = (option: string) => {
    if (!question.multiple) {
      // One answer: choosing is answering, with no button to press afterwards.
      answerQuestion(questionId, [option]);
      return;
    }
    setChosen(list => (list.includes(option) ? list.filter(o => o !== option) : [...list, option]));
  };

  const answer = [...chosen, ...(other.trim() ? [other.trim()] : [])];

  return (
    <div className={cn("rounded-md border border-amber-500/40 bg-amber-500/5", isMd ? "mt-2 p-3" : "mt-1.5 p-2")}>
      <div className="flex items-start gap-1.5">
        <MessageCircleQuestion className={cn("shrink-0 text-amber-600 dark:text-amber-400", isMd ? "mt-[2px] h-4 w-4" : "mt-[1px] h-3.5 w-3.5")} />
        <p className={cn("min-w-0 flex-1 font-medium", isMd ? "text-sm" : "text-xs")}>{question.question}</p>
      </div>

      <div className={cn("flex min-w-0 flex-col items-stretch sm:flex-row sm:flex-wrap sm:items-start", isMd ? "mt-3 gap-2" : "mt-2 gap-1.5")}>
        {question.options.map(option => (
          <Button
            key={option}
            type="button"
            size={isMd ? "default" : "sm"}
            variant={chosen.includes(option) ? "default" : "outline"}
            // An option can be a whole sentence ("Actualizar la documentación al estado real"), and
            // a button that does not wrap took it off the side of the phone.
            className={cn(
              "h-auto max-w-full whitespace-normal break-words text-left leading-snug",
              isMd ? "min-h-9 py-2 text-sm" : "min-h-7 py-1 text-xs",
              question.multiple && (isMd ? "min-w-20" : "min-w-16"),
            )}
            onClick={() => pick(option)}
          >
            {option}
          </Button>
        ))}
      </div>

      {(question.allowOther || question.multiple) && (
        <div className={cn("flex", isMd ? "mt-2 gap-2" : "mt-1.5 gap-1.5")}>
          {question.allowOther && (
            <Input
              className={cn("flex-1", isMd ? "h-9 text-sm" : "h-7 text-xs")}
              placeholder={t("questions.otherPlaceholder")}
              value={other}
              onChange={e => setOther(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && answer.length > 0) answerQuestion(questionId, answer);
              }}
            />
          )}
          <Button
            type="button"
            size={isMd ? "default" : "sm"}
            className={isMd ? "h-9 text-sm" : "h-7 text-xs"}
            disabled={answer.length === 0}
            onClick={() => answerQuestion(questionId, answer)}
          >
            <Send className={cn("mr-1", isMd ? "h-4 w-4" : "h-3.5 w-3.5")} /> {t("questions.send")}
          </Button>
        </div>
      )}
    </div>
  );
}
