// A question an agent asked, answered where it was asked.
//
// An agent that needed the user to decide had two ways out: guess, or end its run with a paragraph
// asking and hope somebody read it. It can put an `ask` block in its answer now, and this is what
// that turns into: the options as a list, room to write one of your own, and the agent carries on
// in the same session with what was chosen.
import { useState } from "react";
import { Check, MessageCircleQuestion, Send } from "lucide-react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { answerOf, EMPTY_CHOICE, pickOption, typeOther } from "@/lib/question-choice";
import { useT } from "@/i18n/useT";
import { cn } from "@/lib/utils";
import type { AgentQuestion } from "@/types";

/** Looks the question up and hands the answer back to the store. The drawing is `QuestionPrompt`. */
export function InlineQuestion({ questionId, size = "sm" }: { questionId: string; size?: "sm" | "md" }) {
  const question = useAppStore(state => state.questions[questionId]);
  const answerQuestion = useAppStore(state => state.answerQuestion);
  if (!question) return null;
  return <QuestionPrompt question={question} size={size} onAnswer={answer => answerQuestion(questionId, answer)} />;
}

/**
 * The question on screen: the options, the box for one of your own, and the button that sends.
 *
 * Takes the question rather than reaching for it, which is what lets the markup be tested — the
 * three things below that are the point of this component (a full-width row per option, the note
 * when several answers are allowed, a send button on both kinds) are all shape, and shape is only
 * worth writing down once if something checks it stayed that way.
 */
export function QuestionPrompt({ question, size = "sm", onAnswer }: {
  question: AgentQuestion;
  size?: "sm" | "md";
  onAnswer: (answer: string[]) => void;
}) {
  const t = useT();
  // The marks made so far. What a second click means, and what happens when an option and the free
  // text would contradict each other, is decided in `lib/question-choice`.
  const [choice, setChoice] = useState(EMPTY_CHOICE);

  const isMd = size === "md";

  if (question.status === "answered") {
    const answer = (question.answer ?? []).join(", ");
    return (
      <p className={cn("text-muted-foreground", isMd ? "mt-2 text-sm" : "mt-1.5 text-xs")}>
        {t(question.auto ? "questions.answeredAuto" : "questions.answered", { answer })}
      </p>
    );
  }

  const multiple = question.multiple;

  // Marking never sends. A single-answer question used to go the moment you touched an option — one
  // click, no way back, and a click meant for the option below it went to the agent instead. Both
  // kinds wait for the button now, so what is about to be said is on screen before it is said.
  const pick = (option: string) => setChoice(current => pickOption(current, option, multiple));

  const answer = answerOf(choice);
  const send = () => {
    if (answer.length > 0) onAnswer(answer);
  };

  return (
    <div className={cn("rounded-md border border-amber-500/40 bg-amber-500/5", isMd ? "mt-2 p-3" : "mt-1.5 p-2")}>
      <div className="flex items-start gap-1.5">
        <MessageCircleQuestion className={cn("shrink-0 text-amber-600 dark:text-amber-400", isMd ? "mt-[2px] h-4 w-4" : "mt-[1px] h-3.5 w-3.5")} />
        <p className={cn("min-w-0 flex-1 font-medium", isMd ? "text-sm" : "text-xs")}>{question.question}</p>
      </div>

      {/* Being allowed to pick several is not something to discover by trying: nothing about a list
          of options says whether the second click keeps the first. */}
      {multiple && (
        <p className={cn("text-muted-foreground", isMd ? "mt-1.5 pl-[22px] text-xs" : "mt-1 pl-5 text-[11px]")}>
          {t("questions.pickMany")}
        </p>
      )}

      {/* Full width, one per line. As inline buttons they were as wide as their own text, so a list
          of options came out ragged and a one-word option was a target the size of the word. */}
      <ul
        role={multiple ? "group" : "radiogroup"}
        aria-label={question.question}
        className={cn("flex min-w-0 flex-col", isMd ? "mt-3 gap-1.5" : "mt-2 gap-1")}
      >
        {question.options.map(option => {
          const picked = choice.chosen.includes(option);
          return (
            <li key={option} role="presentation">
              <button
                type="button"
                role={multiple ? "checkbox" : "radio"}
                aria-checked={picked}
                onClick={() => pick(option)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md border text-left leading-snug transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isMd ? "px-2.5 py-2 text-sm" : "px-2 py-1.5 text-xs",
                  picked
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background hover:bg-muted/60",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-[1px] flex shrink-0 items-center justify-center border transition-colors",
                    isMd ? "h-4 w-4" : "h-3.5 w-3.5",
                    // A square holds several, a circle holds one: the shape says which kind of
                    // question this is before the first click does.
                    multiple ? "rounded-[4px]" : "rounded-full",
                    picked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                  )}
                >
                  {picked && (multiple
                    ? <Check className={isMd ? "h-3 w-3" : "h-2.5 w-2.5"} />
                    : <span className={cn("rounded-full bg-current", isMd ? "h-1.5 w-1.5" : "h-1 w-1")} />)}
                </span>
                <span className="min-w-0 flex-1 break-words">{option}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className={cn("flex", isMd ? "mt-2 gap-2" : "mt-1.5 gap-1.5")}>
        {question.allowOther && (
          <Input
            className={cn("flex-1", isMd ? "h-9 text-sm" : "h-7 text-xs")}
            placeholder={t("questions.otherPlaceholder")}
            value={choice.other}
            onChange={e => setChoice(current => typeOther(current, e.target.value, multiple))}
            onKeyDown={e => {
              if (e.key === "Enter") send();
            }}
          />
        )}
        <Button
          type="button"
          size={isMd ? "default" : "sm"}
          className={cn(isMd ? "h-9 text-sm" : "h-7 text-xs", !question.allowOther && "ml-auto")}
          disabled={answer.length === 0}
          onClick={send}
        >
          <Send className={cn("mr-1", isMd ? "h-4 w-4" : "h-3.5 w-3.5")} /> {t("questions.send")}
        </Button>
      </div>
    </div>
  );
}
