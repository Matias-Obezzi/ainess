import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n/useT";
import { pickPath } from "@/lib/pick-dir";
import { missingValues, type ExtensionValue, type McpbManifest, type UserConfigField } from "@/lib/mcpb";
import { FolderOpen } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manifest: McpbManifest | null;
  /** What was filled in before, when configuring an installed extension again. */
  initial?: Record<string, ExtensionValue>;
  onSave: (values: Record<string, ExtensionValue>) => void;
}

/** One value as the form holds it: what the user typed, before it is turned into its type. */
const asText = (v: ExtensionValue | undefined): string => (v === undefined ? "" : Array.isArray(v) ? v.join("\n") : String(v));

/** The form's text back into the type the manifest declared. */
function typed(field: UserConfigField, raw: string | boolean): ExtensionValue | undefined {
  if (field.type === "boolean") return raw === true;
  const s = String(raw).trim();
  if (!s) return undefined;
  if (field.type === "number") {
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }
  if (field.multiple) return s.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  return s;
}

/** The values an extension's manifest asks for, in the form the manifest describes. */
export function ExtensionConfigDialog({ open, onOpenChange, manifest, initial, onSave }: Props) {
  const t = useT();
  const [form, setForm] = useState<Record<string, string | boolean>>({});

  useEffect(() => {
    if (!open || !manifest) return;
    const next: Record<string, string | boolean> = {};
    for (const f of manifest.fields) {
      const v = initial?.[f.key] ?? f.default;
      next[f.key] = f.type === "boolean" ? v === true : asText(v);
    }
    setForm(next);
  }, [open, manifest, initial]);

  if (!manifest) return null;

  const values: Record<string, ExtensionValue> = {};
  for (const f of manifest.fields) {
    const v = typed(f, form[f.key] ?? "");
    if (v !== undefined) values[f.key] = v;
  }
  const missing = missingValues(manifest, values);

  const browse = async (field: UserConfigField) => {
    const picked = await pickPath({ directory: field.type === "directory" });
    if (!picked) return;
    setForm(prev => ({
      ...prev,
      [field.key]: field.multiple && prev[field.key] ? `${prev[field.key]}\n${picked}` : picked,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle>{t("extensions.configure.title", { name: manifest.displayName })}</DialogTitle>
          <DialogDescription>{t("extensions.configure.description")}</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-2">
          {manifest.fields.map(field => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold" htmlFor={`ext-${field.key}`}>
                {field.title}{field.required && <span className="text-destructive"> *</span>}
              </label>
              {field.description && <span className="text-xs text-muted-foreground">{field.description}</span>}
              {field.type === "boolean" ? (
                <Switch
                  id={`ext-${field.key}`}
                  checked={form[field.key] === true}
                  onCheckedChange={checked => setForm(prev => ({ ...prev, [field.key]: checked }))}
                />
              ) : (
                <div className="flex gap-2">
                  {field.multiple ? (
                    <textarea
                      id={`ext-${field.key}`}
                      className="min-h-16 flex-1 rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs"
                      value={String(form[field.key] ?? "")}
                      onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      id={`ext-${field.key}`}
                      className="flex-1"
                      // A secret is typed, never shown — not even back to whoever configured it.
                      type={field.sensitive ? "password" : field.type === "number" ? "number" : "text"}
                      autoComplete="off"
                      min={field.min}
                      max={field.max}
                      value={String(form[field.key] ?? "")}
                      onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                    />
                  )}
                  {(field.type === "directory" || field.type === "file") && (
                    <Button type="button" variant="outline" size="sm" onClick={() => void browse(field)} aria-label={t("extensions.configure.browse")}>
                      <FolderOpen className="size-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button disabled={missing.length > 0} onClick={() => onSave(values)}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
