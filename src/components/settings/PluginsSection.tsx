import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAppStore } from "@/store";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { confirmDelete } from "@/lib/confirm";
import { getTransport } from "@/lib/transport";
import { pickPath } from "@/lib/pick-dir";
import { plural } from "@/i18n";
import { useT } from "@/i18n/useT";
import {
  detectPlugins, installPlugin, readMarketplace, readPlugin, setPluginEnabled, uninstallPlugin,
  type DetectedPlugin, type MarketplaceEntry,
} from "@/lib/plugins";
import type { Plugin } from "@/types";
import { Blocks } from "lucide-react";

interface PluginsApi { add: () => void }

/**
 * One empty list for "no plugins yet". `?? []` inside the selector handed zustand a new array on every
 * read, which React takes for a store that never stops changing: the section looped until React gave
 * up, and the whole window went black with it.
 */
const NO_PLUGINS: Plugin[] = [];
const Ctx = createContext<PluginsApi | null>(null);
const usePlugins = () => useContext(Ctx)!;

/** Installs a whole folder, or each entry of a marketplace the user picked. */
async function installEntries(entries: MarketplaceEntry[], repo: string | undefined): Promise<string[]> {
  const transport = getTransport();
  const installed: string[] = [];
  for (const entry of entries) {
    let dir: string | null = "dir" in entry.where ? entry.where.dir : null;
    let entryRepo = repo;
    if ("repo" in entry.where) {
      entryRepo = entry.where.repo;
      dir = await transport.clonePluginRepo(entry.where.repo);
    }
    if (!dir) continue;
    const plugin = await installPlugin(dir, { source: "git", ...(entryRepo ? { repo: entryRepo } : {}), managed: true });
    if (plugin) installed.push(plugin.name);
  }
  return installed;
}

export function PluginsSectionProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [repo, setRepo] = useState("");
  const [busy, setBusy] = useState(false);
  // A marketplace that lists more than one plugin: which of them to install.
  const [market, setMarket] = useState<{ repo: string; entries: MarketplaceEntry[] } | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const done = (names: string[]) => {
    if (names.length) toast.success(plural(names.length, t("plugins.installed.one", { name: names[0] }), t("plugins.installed.other", { n: names.length })));
    else toast.error(t("plugins.notAPlugin"));
    setOpen(false);
    setMarket(null);
    setRepo("");
  };

  const fromRepo = async () => {
    const source = repo.trim();
    if (!source) return;
    setBusy(true);
    try {
      const dir = await getTransport().clonePluginRepo(source);
      if (!dir) { toast.error(t("extensions.unavailable")); return; }
      const entries = await readMarketplace(dir);
      // A repository that is one plugin, or a marketplace of exactly that one plugin, installs as is.
      const itself = entries.length === 0 || (entries.length === 1 && "dir" in entries[0].where && (await readPlugin(entries[0].where.dir)) !== null);
      if (itself) {
        const target = entries.length === 1 && "dir" in entries[0].where ? entries[0].where.dir : dir;
        const plugin = await installPlugin(target, { source: "git", repo: source, managed: true });
        if (!plugin) await getTransport().removePluginDir(dir).catch(() => {});
        done(plugin ? [plugin.name] : []);
        return;
      }
      setMarket({ repo: source, entries });
      setChosen(new Set(entries.map(e => e.name)));
    } catch (e) {
      toast.error(t("plugins.cloneFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const fromFolder = async () => {
    const dir = await pickPath({ directory: true });
    if (!dir) return;
    const plugin = await installPlugin(dir, { source: "folder" });
    done(plugin ? [plugin.name] : []);
  };

  const installChosen = async () => {
    if (!market) return;
    setBusy(true);
    try {
      done(await installEntries(market.entries.filter(e => chosen.has(e.name)), market.repo));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Ctx.Provider value={{ add: () => setOpen(true) }}>
      {children}
      <Dialog open={open} onOpenChange={o => { if (!o && !busy) { setOpen(false); setMarket(null); } }}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle>{market ? t("plugins.marketTitle") : t("plugins.addTitle")}</DialogTitle>
            <DialogDescription>{market ? t("plugins.marketDescription") : t("plugins.addDescription")}</DialogDescription>
          </DialogHeader>
          {market ? (
            <div className="-mx-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-2">
              {market.entries.map(entry => {
                const on = chosen.has(entry.name);
                return (
                  <label
                    key={entry.name}
                    className={`flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-left transition-colors has-[button:disabled]:cursor-not-allowed has-[button:disabled]:opacity-60 ${on ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"}`}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox checked={on} onCheckedChange={() => setChosen(prev => { const n = new Set(prev); if (n.has(entry.name)) n.delete(entry.name); else n.add(entry.name); return n; })} />
                      <span className="text-sm font-semibold">{entry.name}</span>
                    </div>
                    {entry.description && <p className="line-clamp-2 pl-6 text-xs text-muted-foreground">{entry.description}</p>}
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3 py-2">
              <label className="text-sm font-semibold" htmlFor="plugin-repo">{t("plugins.repo")}</label>
              <Input id="plugin-repo" value={repo} onChange={e => setRepo(e.target.value)} placeholder="owner/repo" onKeyDown={e => { if (e.key === "Enter") void fromRepo(); }} />
              <span className="text-xs text-muted-foreground">{t("plugins.repoHint")}</span>
              <Button variant="outline" size="sm" className="self-start" onClick={() => void fromFolder()}>{t("plugins.fromFolder")}</Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => { setOpen(false); setMarket(null); }}>{t("common.cancel")}</Button>
            {market
              ? <Button disabled={busy || chosen.size === 0} onClick={() => void installChosen()}>{t("mcpImport.import", { n: chosen.size })}</Button>
              : <Button disabled={busy || !repo.trim()} onClick={() => void fromRepo()}>{busy ? t("plugins.fetching") : t("plugins.install")}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

export function PluginsSectionActions() {
  const t = useT();
  const { add } = usePlugins();
  return <Button size="sm" onClick={add}>{t("plugins.add")}</Button>;
}

export function PluginsSection() {
  const t = useT();
  const plugins = useAppStore(state => state.config.plugins) ?? NO_PLUGINS;
  const skills = useAppStore(state => state.config.skills);
  const servers = useAppStore(state => state.config.mcpServers);
  const { add } = usePlugins();
  const [detected, setDetected] = useState<DetectedPlugin[] | null>(null);
  useEffect(() => {
    let live = true;
    void detectPlugins().then(found => { if (live) setDetected(found); }).catch(() => { if (live) setDetected([]); });
    return () => { live = false; };
  }, []);
  const fresh = useMemo(() => (detected ?? []).filter(d => !plugins.some(p => p.name === d.name)), [detected, plugins]);

  const importDetected = async () => {
    let n = 0;
    for (const d of fresh) if (await installPlugin(d.dir, { source: d.source })) n++;
    if (n) toast.success(plural(n, t("plugins.imported.one", { n }), t("plugins.imported.other", { n })));
  };

  const banner = fresh.length > 0 && (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
      <span className="text-sm">{plural(fresh.length, t("plugins.banner.one", { n: fresh.length, names: fresh.map(f => f.name).join(", ") }), t("plugins.banner.other", { n: fresh.length, names: fresh.map(f => f.name).join(", ") }))}</span>
      <Button size="sm" variant="outline" onClick={() => void importDetected()}>{t("plugins.importAll")}</Button>
    </div>
  );

  if (plugins.length === 0) {
    return (
      <>
        {banner}
        <EmptyState icon={Blocks} title={t("plugins.empty.title")} description={t("plugins.empty.body")} action={{ label: t("plugins.add"), onClick: add }} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {banner}
      <p className="text-xs text-muted-foreground">{t("plugins.reach")}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {plugins.map(plugin => (
          <PluginCard
            key={plugin.id}
            plugin={plugin}
            skills={skills.filter(s => s.plugin === plugin.id).length}
            servers={servers.filter(s => s.plugin === plugin.id).length}
          />
        ))}
      </div>
    </div>
  );
}

function PluginCard({ plugin, skills, servers }: { plugin: Plugin; skills: number; servers: number }) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  const update = async () => {
    if (!plugin.repo) return;
    setBusy(true);
    try {
      const dir = await getTransport().clonePluginRepo(plugin.repo);
      // The repository is the plugin, or a marketplace with it in one of its folders.
      let target: string | null = dir && (await readPlugin(dir)) ? dir : null;
      if (dir && !target) {
        const entry = (await readMarketplace(dir)).find(e => e.name === plugin.name && "dir" in e.where);
        target = entry && "dir" in entry.where ? entry.where.dir : null;
      }
      if (target && (await installPlugin(target, { source: plugin.source, repo: plugin.repo, managed: true }))) toast.success(t("plugins.updated", { name: plugin.name }));
      else toast.error(t("plugins.notAPlugin"));
    } catch (e) {
      toast.error(t("plugins.cloneFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirmDelete(t("plugins.uninstall"), plugin.name))) return;
    await uninstallPlugin(plugin.id);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <Blocks className="size-9 shrink-0 rounded-md bg-muted p-2 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {plugin.name}
              {plugin.version && <span className="text-xs font-normal text-muted-foreground">{plugin.version}</span>}
              {(plugin.source === "claude-synced" || plugin.source === "claude-code") && <Badge variant="outline" className="text-[10px]">{t(`plugins.source.${plugin.source}`)}</Badge>}
            </CardTitle>
            {plugin.author && <span className="text-xs text-muted-foreground">{plugin.author}</span>}
            {plugin.description && <CardDescription className="line-clamp-3">{plugin.description}</CardDescription>}
          </div>
          <Switch checked={plugin.enabled} onCheckedChange={on => setPluginEnabled(plugin.id, on)} aria-label={t("extensions.enabled")} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-1">
          {skills > 0 && <Badge variant="secondary">{plural(skills, t("plugins.count.skills.one", { n: skills }), t("plugins.count.skills.other", { n: skills }))}</Badge>}
          {servers > 0 && <Badge variant="secondary">{plural(servers, t("plugins.count.mcp.one", { n: servers }), t("plugins.count.mcp.other", { n: servers }))}</Badge>}
          {plugin.commands.length > 0 && <Badge variant="secondary">{plural(plugin.commands.length, t("plugins.count.commands.one", { n: plugin.commands.length }), t("plugins.count.commands.other", { n: plugin.commands.length }))}</Badge>}
        </div>
        {(plugin.hooks || plugin.agents) && <span className="text-xs text-muted-foreground">{t("plugins.claudeOnly")}</span>}
      </CardContent>
      <CardFooter className="flex flex-wrap justify-end gap-2">
        {plugin.repo && <Button variant="outline" size="sm" disabled={busy} onClick={() => void update()}>{busy ? t("plugins.fetching") : t("plugins.update")}</Button>}
        <Button variant="destructive" size="sm" onClick={() => void remove()}>{t("plugins.uninstall")}</Button>
      </CardFooter>
    </Card>
  );
}
