// What a running agent is waiting on the user for, drawn under its activity: a tool call to allow
// or refuse, or a form of questions. The agent's turn is held open until one of these is answered
// (see src/lib/live-requests.ts), so the card says plainly that it is waiting.
import { useState } from "react";
import { MessageCircleQuestion, ShieldQuestion } from "lucide-react";
import { useAppStore, selectAgent } from "@/store";
import { useT } from "@/i18n/useT";
import { answerLive, useLiveRequests, type LiveFormField, type LiveRequest } from "@/lib/live-requests";
import { formContent, type FormValues } from "@/lib/acp/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const OPTION_KEY: Record<string, string> = {
  allow_once: "live.allowOnce",
  allow_always: "live.allowAlways",
  reject_once: "live.rejectOnce",
  reject_always: "live.rejectAlways",
};

/** Every request a run has waiting, oldest first. */
export function LiveRequests({ runId }: { runId: string }) {
  const requests = useLiveRequests().filter(r => r.runId === runId);
  if (requests.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {requests.map(request => <LiveRequestCard key={request.id} request={request} />)}
    </div>
  );
}

function LiveRequestCard({ request }: { request: LiveRequest }) {
  const t = useT();
  const name = useAppStore(state => selectAgent(state, request.agentId)?.name) ?? t("notify.anAgent");
  const Icon = request.kind === "permission" ? ShieldQuestion : MessageCircleQuestion;

  return (
    <div role="group" aria-label={t("live.waiting")} className="flex flex-col gap-2 rounded-lg border border-amber-500/50 bg-amber-500/5 p-2.5 text-xs">
      <div className="flex items-start gap-1.5 font-medium">
        <Icon className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />
        <span className="min-w-0 break-words">
          {request.kind === "permission"
            ? t("live.permission.title", { name, tool: request.title })
            : request.message}
        </span>
      </div>
      {request.kind === "permission" ? <PermissionBody request={request} /> : <FormBody request={request} />}
    </div>
  );
}

function PermissionBody({ request }: { request: Extract<LiveRequest, { kind: "permission" }> }) {
  const t = useT();
  return (
    <>
      {request.detail && (
        <code className="block max-h-24 overflow-y-auto break-all rounded bg-background/60 px-2 py-1 font-mono text-[11px]">{request.detail}</code>
      )}
      <div className="flex flex-wrap gap-1.5">
        {request.options.map(option => (
          <Button
            key={option.id}
            size="sm"
            className="h-7 text-xs"
            variant={option.kind === "allow_once" ? "default" : option.kind.startsWith("allow") ? "outline" : "ghost"}
            onClick={() => answerLive(request.id, { kind: "permission", optionId: option.id })}
          >
            {OPTION_KEY[option.kind] ? t(OPTION_KEY[option.kind]) : option.name}
          </Button>
        ))}
      </div>
    </>
  );
}

function FormBody({ request }: { request: Extract<LiveRequest, { kind: "form" }> }) {
  const t = useT();
  const [values, setValues] = useState<FormValues>({});
  const set = (key: string, value: FormValues[string]) => setValues(v => ({ ...v, [key]: value }));
  const content = formContent(request.fields, values);

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={e => {
        e.preventDefault();
        if (content) answerLive(request.id, { kind: "form", action: "accept", content });
      }}
    >
      {request.fields.map(field => <Field key={field.key} field={field} value={values[field.key] ?? field.default} onChange={v => set(field.key, v)} />)}
      <div className="flex flex-wrap gap-1.5">
        <Button type="submit" size="sm" className="h-7 text-xs" disabled={!content}>{t("live.form.send")}</Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => answerLive(request.id, { kind: "form", action: "decline" })}
        >
          {t("live.form.decline")}
        </Button>
      </div>
    </form>
  );
}

function Field({ field, value, onChange }: { field: LiveFormField; value: FormValues[string]; onChange: (value: FormValues[string]) => void }) {
  const label = (
    <span className="font-medium">
      {field.title}
      {field.required && <span className="text-amber-600 dark:text-amber-400"> *</span>}
    </span>
  );
  const hint = field.description && <span className="text-muted-foreground">{field.description}</span>;

  if (field.kind === "boolean") {
    return (
      <label className="flex items-center gap-2">
        <Switch checked={value === true} onCheckedChange={onChange} />
        {label}
      </label>
    );
  }

  if (field.kind === "choice" || field.kind === "multi") {
    const picked = field.kind === "multi" ? (Array.isArray(value) ? value : []) : value;
    return (
      <div role={field.kind === "choice" ? "radiogroup" : "group"} aria-label={field.title} className="flex flex-col gap-1">
        {label}
        {hint}
        {field.options.map(option => {
          const on = field.kind === "multi" ? (picked as string[]).includes(option.value) : picked === option.value;
          const toggle = () => {
            if (field.kind === "choice") onChange(option.value);
            else onChange(on ? (picked as string[]).filter(v => v !== option.value) : [...(picked as string[]), option.value]);
          };
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 transition-colors",
                on ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40",
              )}
            >
              {field.kind === "multi"
                ? <Checkbox checked={on} onCheckedChange={toggle} className="mt-px" />
                : <input type="radio" name={field.key} checked={on} onChange={toggle} className="mt-0.5 accent-primary" />}
              <span className="flex min-w-0 flex-col">
                <span>{option.label}</span>
                {option.description && <span className="text-muted-foreground">{option.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <label className="flex flex-col gap-1">
      {label}
      {hint}
      <Input
        className="h-7 text-xs"
        type={field.kind === "number" ? "number" : "text"}
        value={value === undefined ? "" : String(value)}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  );
}
