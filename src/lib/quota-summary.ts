// Turns a provider's raw quota (src/lib/quota.ts) into the numbers the UI draws for one agent.
//
// Two of them, and they point opposite ways on purpose. `fraction` is how much is LEFT — that is
// what says whether an agent can still run, and what colours the ring. `label` is how much was
// SPENT, because the ring and the bar fill up as the quota is consumed, and a number next to a bar
// has to be counting the same thing the bar is.
//
// Pure module, no store and no I/O, so it is easy to test.
import { ProviderQuota, QuotaItem } from "@/types";
import { formatQuotaLine, formatResetsAt, poolOf } from "@/lib/quota";
import { translateNow } from "@/i18n/useT";

export interface QuotaSummary {
  /**
   * Remaining share, 0..1, or null when the provider does not report enough to know. This is the
   * one the rest of the app reasons with: zero is an agent that cannot run.
   */
  fraction: number | null;
  /**
   * Compact label of what has been SPENT, to sit beside the ring or the bar, both of which fill as
   * the quota goes: "38%", "38/50", or "∞" when there is no ceiling to spend against.
   */
  label: string;
  /** One line for the tooltip: what it is and when it resets. */
  detail: string;
  /**
   * Every item that applies, one line each. With nothing to draw a ring with — opencode reports
   * what each linked account spent and no ceiling — these lines are the whole answer, and showing
   * only the first one hid the other accounts.
   */
  details: string[];
  /**
   * Why there is no number, when the provider itself explained it.
   *
   * An empty ring with a dash next to it reads as something broken. It is not: some providers
   * answer honestly that they cannot say how much is left. That answer belongs on screen next to
   * the missing number, not only in the code.
   */
  note?: string;
  status: "ok" | "unavailable" | "error" | "exhausted";
}

/**
 * True when a quota item applies to a model. Items carry either the exact model id, a family
 * ("opus", "sonnet" in Claude's weekly windows) or a pool prefix ("gemini", "claude" in
 * Antigravity), so match on all three shapes.
 */
function itemAppliesTo(itemModel: string, model: string): boolean {
  const item = itemModel.toLowerCase();
  const target = model.toLowerCase();
  return item === target || target.includes(item) || poolOf(target) === item;
}

/**
 * The items of `quota` that count for an agent: the provider-wide ones plus its models'.
 *
 * An agent with no model pinned takes them all, the same way one whose model the orchestrator
 * picks does: it can end up on any of them. Keeping only the provider-wide items left an opencode
 * agent with nothing at all, since every one of its lines belongs to an account.
 */
function applicableItems(items: QuotaItem[], models: string[]): QuotaItem[] {
  if (models.length === 0) return items;
  return items.filter(item => !item.model || models.some(model => itemAppliesTo(item.model!, model)));
}

/** One item as a sentence: "<label>: <value> · renews <date>", in the active language. */
function detailOf(item: QuotaItem): string {
  // formatQuotaLine renders the reset as a UTC timestamp (it is shared with the CLI); the UI wants
  // the localized one, so drop it there and append it here.
  const base = formatQuotaLine({ ...item, resetsAt: undefined });
  const resets = formatResetsAt(item.resetsAt);
  return resets ? translateNow("quota.detailWithReset", { detail: base, date: resets }) : base;
}

function summaryOf(fraction: number, label: string, detail: string, details: string[]): QuotaSummary {
  const clamped = Math.max(0, Math.min(1, fraction));
  return { fraction: clamped, label, detail, details, status: clamped <= 0 ? "exhausted" : "ok" };
}

/**
 * Narrows a provider's quota to what one agent can actually use: the items of its model plus the
 * provider-wide ones. With `allModels` (the agent lets the orchestrator pick), every model of that
 * provider counts, so the summary is the total left over the total available.
 */
export function summarizeAgentQuota(
  quota: ProviderQuota | undefined,
  opts: { model?: string; allModels?: string[] },
): QuotaSummary {
  if (!quota) {
    const detail = translateNow("quota.noQuotaData");
    return { fraction: null, label: "—", detail, details: [detail], status: "unavailable" };
  }
  if (quota.status !== "ok") {
    const detail = quota.message || translateNow("quota.noQuotaData");
    return { fraction: null, label: "—", detail, details: [detail], status: quota.status };
  }

  const models = opts.allModels?.length ? opts.allModels : opts.model ? [opts.model] : [];
  const items = applicableItems(quota.items, models);
  if (items.length === 0) {
    const detail = quota.message || translateNow("quota.noQuotaData");
    return { fraction: null, label: "—", detail, details: [detail], status: "ok" };
  }
  const details = items.map(detailOf);

  // Absolute counters win: they are the only ones that can be added up honestly.
  const counted = items.filter(i => !i.unlimited && i.remaining !== undefined && i.entitlement !== undefined);
  if (counted.length > 0) {
    const remaining = counted.reduce((sum, i) => sum + (i.remaining ?? 0), 0);
    const entitlement = counted.reduce((sum, i) => sum + (i.entitlement ?? 0), 0);
    const fraction = entitlement > 0 ? remaining / entitlement : 0;
    return summaryOf(fraction, `${entitlement - remaining}/${entitlement}`, detailOf(leadItem(counted, i => share(i))), details);
  }

  const percents = items.filter(i => !i.unlimited && i.percentRemaining !== undefined);
  if (percents.length > 0) {
    const avg = percents.reduce((sum, i) => sum + (i.percentRemaining ?? 0), 0) / percents.length;
    const fraction = avg / 100;
    return summaryOf(fraction, `${Math.round(100 - avg)}%`, detailOf(leadItem(percents, i => (i.percentRemaining ?? 0) / 100)), details);
  }

  const windows = items.filter(i => !i.unlimited && i.usedPercent !== undefined);
  if (windows.length > 0) {
    // The tightest window is the one that stops the agent, so it drives the ring.
    const lead = leadItem(windows, i => 1 - (i.usedPercent ?? 0) / 100);
    const fraction = 1 - (lead.usedPercent ?? 0) / 100;
    return summaryOf(fraction, `${Math.round(100 - fraction * 100)}%`, detailOf(lead), details);
  }

  const unlimited = items.filter(i => i.unlimited);
  if (unlimited.length === items.length) {
    return { fraction: 1, label: "∞", detail: detailOf(unlimited[0]), details, status: "ok" };
  }

  // Items with no numbers at all (Antigravity pools, which only say whether they are used up): the
  // ring stays off, the detail still tells the story, and whatever the provider said about why it
  // has no numbers comes along as the note.
  return { fraction: null, label: "—", detail: detailOf(items[0]), details, note: quota.message, status: "ok" };
}

/** The item that binds: the one with the least left over, falling back to the first. */
function leadItem(items: QuotaItem[], shareOf: (item: QuotaItem) => number): QuotaItem {
  let lead = items[0];
  let best = shareOf(lead);
  for (const item of items.slice(1)) {
    const value = shareOf(item);
    if (value < best) {
      lead = item;
      best = value;
    }
  }
  return lead;
}

/** Remaining share of a single counted item (1 when it reports no entitlement). */
function share(item: QuotaItem): number {
  const entitlement = item.entitlement ?? 0;
  if (entitlement <= 0) return 1;
  return (item.remaining ?? 0) / entitlement;
}
