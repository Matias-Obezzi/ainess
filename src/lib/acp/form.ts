// A question form from an agent (ACP `elicitation/create`, form mode) reduced to fields the app can
// draw, and the answer put back in the shape the agent expects.
//
// The schema is a restricted JSON Schema: a flat object whose properties are strings (free text,
// or one of a list), numbers, booleans, or arrays of strings picked from a list. Anything else is
// drawn as free text, which is the one input that can carry any answer.
import type { ElicitationSchema } from "@agentclientprotocol/sdk";
import type { LiveFormField } from "@/lib/live-requests";

type Option = { value: string; label: string; description?: string };

function optionsOf(list: unknown): Option[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap(o => {
    if (typeof o === "string") return [{ value: o, label: o }];
    if (o && typeof o === "object" && typeof (o as { const?: unknown }).const === "string") {
      const opt = o as { const: string; title?: string; description?: string };
      return [{ value: opt.const, label: opt.title || opt.const, ...(opt.description ? { description: opt.description } : {}) }];
    }
    return [];
  });
}

export function formFields(schema: ElicitationSchema | undefined | null): LiveFormField[] {
  const required = new Set(schema?.required ?? []);
  return Object.entries(schema?.properties ?? {}).map(([key, raw]) => {
    const prop = raw as Record<string, unknown>;
    const base = {
      key,
      title: typeof prop.title === "string" && prop.title ? prop.title : key,
      ...(typeof prop.description === "string" && prop.description ? { description: prop.description } : {}),
      required: required.has(key),
    };
    if (prop.type === "boolean") {
      return { ...base, kind: "boolean", options: [], ...(typeof prop.default === "boolean" ? { default: prop.default } : {}) };
    }
    if (prop.type === "number" || prop.type === "integer") {
      return { ...base, kind: "number", options: [], ...(typeof prop.default === "number" ? { default: prop.default } : {}) };
    }
    if (prop.type === "array") {
      const items = (prop.items ?? {}) as Record<string, unknown>;
      const options = optionsOf(items.anyOf ?? items.enum);
      return { ...base, kind: options.length ? "multi" : "text", options };
    }
    const options = optionsOf(prop.oneOf ?? prop.enum);
    return {
      ...base,
      kind: options.length ? "choice" : "text",
      options,
      ...(typeof prop.default === "string" ? { default: prop.default } : {}),
    };
  }) as LiveFormField[];
}

export type FormValues = Record<string, string | number | boolean | string[] | undefined>;

/**
 * The answer as the agent wants it: only the fields that hold something, numbers as numbers.
 * Null when a required field is still empty, so the form cannot be sent half filled.
 */
export function formContent(fields: LiveFormField[], values: FormValues): Record<string, string | number | boolean | string[]> | null {
  const out: Record<string, string | number | boolean | string[]> = {};
  for (const field of fields) {
    const value = values[field.key] ?? field.default;
    const empty = value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
    if (empty) {
      if (field.required) return null;
      continue;
    }
    if (field.kind === "number") {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return null;
      out[field.key] = n;
    } else {
      out[field.key] = value as string | boolean | string[];
    }
  }
  return out;
}
