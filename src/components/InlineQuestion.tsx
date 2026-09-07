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

export function InlineQuestion({ questionId }: { questionId: string }) {
  const t = useT();
  const question = useAppStore(state => state.questions[questionId]);
  const answerQuestion = useAppStore(state => state.answerQuestion);
  const [chosen, setChosen] = useState<string[]>([]);
  const [other, setOther] = useState("");

  if (!question) return null;

  if (question.status === "answered") {
    return (
      <p className="mt-1.5 text-xs text-muted-foreground">
        {t("questions.answered", { answer: (question.answer ?? []).join(", ") })}
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
    <div className="mt-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
      <div className="flex items-start gap-1.5">
        <MessageCircleQuestion className="mt-[1px] h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="min-w-0 flex-1 text-xs font-medium">{question.question}</p>
      </div>

      <div className="mt-2 flex min-w-0 flex-col items-stretch gap-1.5 sm:flex-row sm:flex-wrap sm:items-start">
        {question.options.map(option => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={chosen.includes(option) ? "default" : "outline"}
            // An option can be a whole sentence ("Actualizar la documentación al estado real"), and
            // a button that does not wrap took it off the side of the phone.
            className={cn(
              "h-auto min-h-7 max-w-full whitespace-normal break-words py-1 text-left text-xs leading-snug",
              question.multiple && "min-w-16",
            )}
            onClick={() => pick(option)}
          >
            {option}
          </Button>
        ))}
      </div>

      {(question.allowOther || question.multiple) && (
        <div className="mt-1.5 flex gap-1.5">
          {question.allowOther && (
            <Input
              className="h-7 flex-1 text-xs"
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
            size="sm"
            className="h-7 text-xs"
            disabled={answer.length === 0}
            onClick={() => answerQuestion(questionId, answer)}
          >
            <Send className="mr-1 h-3.5 w-3.5" /> {t("questions.send")}
          </Button>
        </div>
      )}
    </div>
  );
}
