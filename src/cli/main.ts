import { parseArgs } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import { useAppStore, selectRoots, selectAllAgents, selectProjectAgents } from "@/store";
import { setTransport } from "@/lib/transport";
import { nodeTransport, killAllSync, wingetCandidates } from "@/lib/transport-node";
import * as readline from "node:readline";
import { isChatActive } from "@/lib/chat";
import { flushHistory, loadHistory } from "@/lib/history";
import { flushTasks } from "@/lib/task-store";
import { flushNotifications } from "@/lib/notification-store";

import { pendingApprovals } from "@/lib/approvals";
import { remoteUrl, tunnelUrl } from "@/lib/remote";
import { installConsoleCapture, log } from "@/lib/logger";
import { isTunnelProvider, normalizeDomain } from "@/lib/tunnel";
import { killTunnelSync } from "@/lib/tunnel-node";
import { localIp } from "@/lib/remote-node";
import { claudeCandidateDirs } from "@/lib/transport-node";
import * as os from "node:os";
import type { ChatParticipant } from "@/types";
import { AgentConfig, Skill, McpServer, ProviderId, AgentRole } from "@/types";
import { defaultAgentDescription } from "@/lib/providers";
import { agentAfterEdit, agentAutoApprove, autoApproveFlag } from "@/lib/team";
import { syncMcpToAntigravity } from "@/lib/mcp-sync";
import { mcpHeadersFromArgs } from "@/lib/mcp-headers";
import { nodeI18n } from "@/i18n/node";
import { totalsOf, totalsByAgent, totalsByDay, runsOfProject, totalTokens, formatUsage, hasUsage } from "@/lib/usage";

/** Writes whatever this process still owes to disk (feed, board and notifications) before it exits. */
const flushAll = async (): Promise<void> => {
  await Promise.all([flushHistory(), flushTasks(), flushNotifications()]);
};


async function main() {
  setTransport(nodeTransport);
  // Everything the CLI prints (and any crash) also goes to the shared log file.
  installConsoleCapture();
  const rawArgs = process.argv.slice(2);
  const loggedArgs = rawArgs.map((arg, i) => {
    if (i > 0 && rawArgs[i - 1] === "--header") {
      const colon = arg.indexOf(":");
      return colon !== -1 ? `${arg.slice(0, colon)}: ***` : "***";
    }
    return arg;
  });
  log.info("cli", `ainess ${loggedArgs.join(" ")}`);
  await useAppStore.getState().init();
  const store = useAppStore.getState();
  const { locale, t } = nodeI18n(store.config.language, process.env);

  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");

  /** Fresh state: the actions replace `config`, so the snapshot above goes stale after a write. */
  const live = () => useAppStore.getState();
  /** Every agent of every project: ids are unique, so an id alone is enough to find one. */
  const allAgents = () => selectAllAgents(live());
  const agentById = (id?: string) => (id ? allAgents().find(a => a.id === id) : undefined);
  /** By name, anywhere: for the global config (hooks, órdenes, skills, MCP). */
  const agentByName = (name: string) => allAgents().find(a => a.name.toLowerCase() === name.trim().toLowerCase());
  /** By name inside one project's team: that is the scope a delegation resolves in. */
  const projectAgentByName = (projectId: string, name: string) =>
    selectProjectAgents(live(), projectId).find(a => a.name.toLowerCase() === name.trim().toLowerCase());

  // Anything JSON can carry: `--json` prints it verbatim, and the shape is the caller's business.
  function print(obj: unknown, text: string) {
    if (jsonOutput) {
      console.log(JSON.stringify(obj));
    } else {
      console.log(text);
    }
  }

  function error(msg: string): never {
    if (jsonOutput) {
      console.error(JSON.stringify({ error: msg }));
    } else {
      console.error(msg);
    }
    process.exit(2);
  }

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(t("cli.help"));
    process.exit(0);
  }

  const KNOWN = new Set(["run", "agents", "formations", "skills", "mcp", "hooks", "context", "projects", "detect", "quota", "doctor", "profile", "presets", "chat", "history", "status", "usage", "approvals", "serve", "remote"]);
  const first = args[0];

  // A bare lowercase word that is not a subcommand is a typo, never a prompt (prompts go
  // through `ainess run "<texto>"` or contain spaces). Rejecting it avoids burning tokens.
  if (!first.startsWith("-") && !KNOWN.has(first) && /^[a-z][a-z0-9-]{0,24}$/.test(first)) {
    error(t("cli.unknownSubcommand", { name: first, known: [...KNOWN].join(", ") }));
  }

  if (first === "detect") {
    const sub = args[1] || "list";
    if (sub === "list" || sub === "--verbose") {
      if (args.includes("--verbose")) {
        console.log(`Entorno: APPDATA=${process.env.APPDATA ?? "(sin definir)"}  USERPROFILE=${process.env.USERPROFILE ?? "(sin definir)"}  usuario=${os.userInfo().username}`);
        for (const d of claudeCandidateDirs()) {
          let entries: string[] = [];
          try { entries = fs.readdirSync(d); } catch { /* missing */ }
          console.log(t("cli.claudeFolder", { dir: d, contents: fs.existsSync(d) ? entries.join(", ") || t("cli.folderEmpty") : t("cli.folderMissing") }));
        }
        console.log(t("cli.claudeOnPath", { yes: String(process.env.PATH?.split(";").some(p => fs.existsSync(path.join(p, "claude.exe")) || fs.existsSync(path.join(p, "claude.cmd"))) ? "sí" : "no") }));
        for (const name of ["copilot", "gemini", "codex"]) {
          const found = wingetCandidates(name).filter(p => fs.existsSync(p));
          if (found.length) console.log(`winget ${name}: ${found.join(", ")}`);
        }
      }
      if (jsonOutput) {
        console.log(JSON.stringify(store.binaries));
      } else {
        const providers = Object.keys(store.binaries) as ProviderId[];
        for (const p of providers) {
          const bin = store.binaries[p];
          if (bin?.path) {
            console.log(`${p}: ${bin.path} ${bin.version ? `(${bin.version})` : ""}`);
          } else {
            console.log(`${p}: No detectado`);
          }
        }
      }
      process.exit(0);
    } else if (sub === "set") {
      const provider = args[2] as ProviderId;
      const rp = args[3];
      if (!provider || !rp) error(t("cli.usage", { usage: "ainess detect set <provider> <path>" }));
      store.updateConfig({ binaryOverrides: { ...store.config.binaryOverrides, [provider]: rp } });
      await store.detectBinaries();
      print({ ok: true }, "Override seteado.");
      process.exit(0);
    } else if (sub === "clear") {
      const provider = args[2] as ProviderId;
      if (!provider) error(t("cli.usage", { usage: "ainess detect clear <provider>" }));
      const overrides = { ...store.config.binaryOverrides };
      delete overrides[provider];
      store.updateConfig({ binaryOverrides: overrides });
      await store.detectBinaries();
      print({ ok: true }, "Override borrado.");
      process.exit(0);
    }
  }

  if (first === "quota") {
    const { fetchQuota, formatQuotaLine } = await import("@/lib/quota");
    const requested = args[1] && !args[1].startsWith("-") ? (args[1] as ProviderId) : undefined;
    const providers: ProviderId[] = requested
      ? [requested]
      : (Array.from(new Set(allAgents().map(a => a.provider))) as ProviderId[]);

    const results: Record<string, unknown> = {};
    for (const p of providers) {
      const q = await fetchQuota(p, useAppStore.getState().binaries, { force: true });
      results[p] = q;
      if (!jsonOutput) {
        if (q.status !== "ok") {
          console.log(`${p}: ${q.message || q.status}`);
        } else if (q.items.length === 0) {
          console.log(t("cli.noInfo", { name: p }));
        } else {
          console.log(`${p}: ${q.items.map(formatQuotaLine).join(", ")}`);
        }
      }
    }
    if (jsonOutput) console.log(JSON.stringify(results));
    process.exit(0);
  }

  // `ainess doctor`: the same checks the app's Diagnóstico section runs, printed in Spanish. Exit
  // code 1 when any of them is an error, so a script can gate on it.
  if (first === "doctor") {
    const { collectDiagnostics, formatDiagnosticsReport, worstLevel } = await import("@/lib/diagnostics");

    const results = await collectDiagnostics(t, { refreshQuota: true });
    if (jsonOutput) {
      console.log(JSON.stringify(results));
    } else {
      const stamp = new Date().toLocaleString(locale, { hour12: false });
      console.log(formatDiagnosticsReport(results, t, `${t("diagnostics.reportTitle")} — ${stamp}`));
    }
    // Nothing was modified, so there is nothing to flush: exiting drops the pending load timers.
    process.exit(worstLevel(results) === "error" ? 1 : 0);
  }

  if (first === "profile") {
    const sub = args[1] || "show";
    if (sub === "show") {
      print(store.config.profile, `Nombre: ${store.config.profile?.name}\nSobre vos: ${store.config.profile?.about}\nPreferencias: ${store.config.profile?.preferences}`);
      process.exit(0);
    } else if (sub === "set") {
      const { values } = parseArgs({
        args: args.slice(2),
        options: {
          name: { type: "string" },
          about: { type: "string" },
          "about-file": { type: "string" },
          preferences: { type: "string" },
        },
        strict: false
      });
      const current = store.config.profile || { name: "", about: "", preferences: "" };
      let about = values.about as string | undefined;
      if (values["about-file"]) about = fs.readFileSync(values["about-file"] as string, "utf-8");
      
      store.updateConfig({
        profile: {
          name: values.name !== undefined ? String(values.name) : current.name,
          about: about !== undefined ? about : current.about,
          preferences: values.preferences !== undefined ? String(values.preferences) : current.preferences,
        }
      });
      await store.saveConfig();
      print({ ok: true }, t("cli.profileSaved"));
      process.exit(0);
    }
  }

  if (first === "presets") {
    const sub = args[1] || "list";
    if (sub === "list") {
      print(store.config.presets, store.config.presets?.map(p => `- ${p.name}: ${p.prompt.substring(0, 50)}... [Agent: ${p.agentId||"Cualquiera"}] [Model: ${p.model||"Predeterminado"}]`).join("\n") || "");
      process.exit(0);
    } else if (sub === "add") {
      const name = args[2];
      if (!name) error(t("cli.nameMissing"));
      const { values } = parseArgs({
        args: args.slice(3),
        options: {
          prompt: { type: "string" },
          agent: { type: "string" },
          model: { type: "string" },
        },
        strict: false
      });
      if (!values.prompt) error(t("cli.flagMissing", { flag: "--prompt" }));
      let agentId: string | undefined = undefined;
      if (values.agent) {
        const a = agentByName(String(values.agent));
        if (!a) error(t("cli.agentNotFound", { name: String(values.agent) }));
        agentId = a.id;
      }
      const p = {
        id: crypto.randomUUID(),
        name,
        prompt: String(values.prompt),
        agentId,
        model: values.model ? String(values.model) : undefined
      };
      const presets = [...(store.config.presets || [])];
      const idx = presets.findIndex(x => x.name === name);
      if (idx >= 0) presets[idx] = p; else presets.push(p);
      store.updateConfig({ presets });
      await store.saveConfig();
      print(p, t("cli.presetSaved"));
      process.exit(0);
    } else if (sub === "remove") {
      const name = args[2];
      if (!name) error(t("cli.nameMissing"));
      const presets = (store.config.presets || []).filter(p => p.name !== name);
      store.updateConfig({ presets });
      await store.saveConfig();
      print({ ok: true }, t("cli.presetRemoved"));
      process.exit(0);
    }
  }

  if (first === "agents") {
    const sub = args[1] || "list";
    // Agents belong to a project, so every subcommand needs one (-p <nombre> / -w <dir>, else cwd).
    const { values: av } = parseArgs({
      args: args.slice(2),
      options: { project: { type: "string", short: "p" }, workspace: { type: "string", short: "w" } },
      allowPositionals: true,
      strict: false,
    });
    const agentsProjectId = resolveProjectId(av.project as string | undefined, av.workspace as string | undefined);
    const teamOf = () => selectProjectAgents(live(), agentsProjectId);

    if (sub === "list") {
      const team = teamOf();
      if (jsonOutput) {
        console.log(JSON.stringify(team));
      } else {
        if (team.length === 0) console.log(t("cli.noAgentsApplyFormation"));
        for (const a of team) {
          const parent = a.parentId ? team.find(x => x.id === a.parentId)?.name || a.parentId : "root";
          console.log(`- ${a.name} [${a.role}] (Provider: ${a.provider}, Parent: ${parent})`);
        }
      }
      process.exit(0);
    } else if (sub === "init") {
      const providerKeys = Object.keys(store.binaries) as ProviderId[];
      const detectables = providerKeys.filter(p => p !== "custom");
      const rootPlanner = teamOf().find(a => a.parentId === null && a.role === "planner");
      let added = 0;
      for (const p of detectables) {
        const bin = store.binaries[p];
        const hasAgent = teamOf().some(a => a.provider === p);
        if (bin && bin.path && bin.version !== null && !hasAgent) {
          store.addAgent(agentsProjectId, {
            id: crypto.randomUUID(),
            name: p.charAt(0).toUpperCase() + p.slice(1),
            provider: p,
            role: "implementer",
            parentId: rootPlanner ? rootPlanner.id : null,
            autoApprove: true,
            color: "#6b7280"
          });
          added++;
        }
      }
      await store.saveConfig();
      print({ added }, `Inicializados ${added} agentes.`);
      process.exit(0);
    } else if (sub === "add" || sub === "edit") {
      const { values, positionals } = parseArgs({
        args: args.slice(2),
        options: {
          name: { type: "string" },
          provider: { type: "string" },
          role: { type: "string" },
          parent: { type: "string" },
          model: { type: "string" },
          "auto-approve": { type: "boolean" },
          // parseArgs has no off switch for a boolean: `--auto-approve=false` is rejected outright.
          "no-auto-approve": { type: "boolean" },
          description: { type: "string" },
          "system-prompt-file": { type: "string" },
          color: { type: "string" },
          program: { type: "string" },
          args: { type: "string" },
          project: { type: "string", short: "p" },
          workspace: { type: "string", short: "w" },
        },
        allowPositionals: true
      });
      const targetName = (sub === "add" ? values.name : positionals[0]) as string | undefined;
      if (!targetName) error(t("cli.nameMissing"));

      let agent = projectAgentByName(agentsProjectId, targetName);
      if (sub === "add" && agent) error(t("cli.agentExists"));
      if (sub === "edit" && !agent) error(t("cli.agentNotFoundInProject"));

      const id = agent ? agent.id : crypto.randomUUID();
      const name = (values.name as string) || (agent ? agent.name : targetName);
      if (values.name) {
        const existing = projectAgentByName(agentsProjectId, String(values.name));
        if (existing && existing.id !== id) error(t("cli.agentNameTaken"));
      }

      let parentId: string | null = agent ? agent.parentId : null;
      if (values.parent) {
        if (String(values.parent).toLowerCase() === "null" || values.parent === "") parentId = null;
        else {
          const p = projectAgentByName(agentsProjectId, String(values.parent));
          if (!p) error(t("cli.parentNotFoundInProject"));
          parentId = p.id;
        }
      }

      let systemPrompt = agent ? agent.systemPrompt : undefined;
      if (values["system-prompt-file"]) {
        systemPrompt = fs.readFileSync(values["system-prompt-file"] as string, "utf-8");
      }

      const newAgent: AgentConfig = {
        id,
        name,
        provider: (values.provider as ProviderId) || (agent?.provider ?? "claude"),
        role: (values.role as AgentRole) || (agent?.role ?? "implementer"),
        parentId,
        model: values.model !== undefined ? String(values.model) : agent?.model,
        autoApprove: agentAutoApprove(
          autoApproveFlag(values["auto-approve"] as boolean | undefined, values["no-auto-approve"] as boolean | undefined),
          agent,
        ),
        // A new agent under a planner introduces itself, the same as in the app.
        description:
          values.description !== undefined
            ? String(values.description)
            : agent?.description ??
              (parentId !== null
                ? defaultAgentDescription(
                    (values.role as AgentRole) || "implementer",
                    (values.provider as ProviderId) || "claude",
                  )
                : undefined),
        systemPrompt,
        color: values.color !== undefined ? String(values.color) : agent?.color,
      };
      
      if (newAgent.provider === "custom") {
        newAgent.customCommand = {
          program: String(values.program || agent?.customCommand?.program || ""),
          args: String(values.args || agent?.customCommand?.args.join(" ") || "").split(" ")
        };
      }

      // Only the flags above are named here, and `addAgent` replaces the agent whole: without
      // this, an edit dropped everything the CLI has no flag for — the delegation approval
      // override among them, which is how an agent set to "never ask" went back to asking.
      const saved = agentAfterEdit(agent, newAgent);
      store.addAgent(agentsProjectId, saved);
      await store.saveConfig();
      print(saved, t(sub === "add" ? "cli.agentAdded" : "cli.agentEdited", { name }));
      process.exit(0);
    } else if (sub === "remove") {
      const name = args[2];
      if (!name || name.startsWith("-")) error(t("cli.nameMissing"));
      const agent = projectAgentByName(agentsProjectId, name);
      if (!agent) error(t("cli.notFoundInProject"));
      store.removeAgent(agentsProjectId, agent.id);
      await store.saveConfig();
      print({ id: agent.id }, t("cli.agentRemoved"));
      process.exit(0);
    }
  }

  // Formations: saved teams a project can be started from (or topped up with).
  if (first === "formations") {
    const sub = args[1] || "list";
    if (sub === "list") {
      const formations = live().config.formations;
      if (jsonOutput) {
        console.log(JSON.stringify(formations));
      } else {
        if (formations.length === 0) console.log("No hay formaciones guardadas.");
        for (const f of formations) {
          const mark = f.id === live().config.defaultFormationId ? " (predeterminada)" : "";
          const who = f.agents.map(a => `${a.name} [${a.provider}]`).join(", ") || t("cli.noAgents");
          console.log(`- ${f.name}${mark}: ${who}`);
        }
      }
      process.exit(0);
    } else if (sub === "apply") {
      const { values: fv, positionals: fp } = parseArgs({
        args: args.slice(2),
        options: { project: { type: "string", short: "p" }, workspace: { type: "string", short: "w" } },
        allowPositionals: true,
        strict: false,
      });
      const wanted = fp[0];
      if (!wanted) error(t("cli.formationsApplyUsage"));
      const formation = live().config.formations.find(f => f.name.toLowerCase() === wanted.toLowerCase());
      if (!formation) error(t("cli.formationNotFound", { name: wanted }));
      const projectId = resolveProjectId(fv.project as string | undefined, fv.workspace as string | undefined);
      store.applyFormation(projectId, formation.id);
      await store.saveConfig();
      const added = formation.agents.length;
      print({ ok: true, added }, t("cli.formationApplied", { name: formation.name, n: added }));
      process.exit(0);
    }
    error(t("cli.formationsUsage"));
  }

  if (first === "skills") {
    const sub = args[1] || "list";
    if (sub === "list") {
      print(store.config.skills, store.config.skills.map(s => `- ${s.name}: ${s.description || ""}`).join("\n"));
      process.exit(0);
    } else if (sub === "add" || sub === "edit") {
      const targetName = args[2];
      if (!targetName || targetName.startsWith("-")) error(t("cli.nameMissing"));
      
      const { values } = parseArgs({
        args: args.slice(3),
        options: {
          file: { type: "string" },
          description: { type: "string" },
          agents: { type: "string" },
        }
      });

      let skill = store.config.skills.find(s => s.name.toLowerCase() === targetName.toLowerCase());
      if (sub === "add" && skill) error(t("cli.skillExists"));
      if (sub === "edit" && !skill) error(t("cli.skillNotFound"));

      const id = skill ? skill.id : crypto.randomUUID();
      let content = skill ? skill.content : "";
      if (values.file) content = fs.readFileSync(values.file as string, "utf-8");

      let enabledFor: "all" | string[] = skill ? skill.enabledFor : "all";
      if (values.agents) {
        if (values.agents === "all") enabledFor = "all";
        else {
          enabledFor = String(values.agents).split(",").map((n: string) => {
            const a = agentByName(n);
            if (!a) error(t("cli.agentNotFound", { name: n }));
            return a.id;
          });
        }
      }

      const newSkill: Skill = {
        id,
        name: targetName,
        description: values.description !== undefined ? String(values.description) : skill?.description,
        content,
        enabledFor
      };

      store.upsertSkill(newSkill);
      await store.saveConfig();
      print(newSkill, `Skill ${sub} ok`);
      process.exit(0);
    } else if (sub === "remove" || sub === "show") {
      const name = args[2];
      const skill = store.config.skills.find(a => a.name.toLowerCase() === name.toLowerCase());
      if (!skill) error(t("cli.notFound"));
      if (sub === "remove") {
        store.removeSkill(skill.id);
        await store.saveConfig();
        print({ id: skill.id }, t("cli.removed"));
      } else {
        print(skill, skill.content);
      }
      process.exit(0);
    }
  }

  if (first === "hooks") {
    const sub = args[1] || "list";
    if (sub === "list") {
      print(store.config.hooks, store.config.hooks?.map(h => `- ${h.name} [${h.enabled ? "ON" : "OFF"}] Event: ${h.event} -> Action: ${h.action.type}`).join("\n") || "");
      process.exit(0);
    } else if (sub === "add") {
      const name = args[2];
      if (!name || name.startsWith("-")) error(t("cli.nameMissing"));
      
      const { values } = parseArgs({
        args: args.slice(3),
        options: {
          event: { type: "string" },
          action: { type: "string" },
          url: { type: "string" },
          template: { type: "string" },
          program: { type: "string" },
          args: { type: "string" },
          agent: { type: "string" },
          "filter-agent": { type: "string" },
          "filter-project": { type: "string" },
        },
        strict: false
      });
      if (!values.event || !values.action) error(t("cli.flagsMissing", { flags: "--event, --action" }));

      let action: import("@/types").HookAction | null = null;
      // `parseArgs` hands back `string | boolean`: a flag written with no value arrives as `true`.
      // Typing the action is what surfaced it — `--url` with nothing after it was being stored as
      // the webhook's address.
      const text = (value: string | boolean | undefined, fallback = ""): string =>
        typeof value === "string" ? value : fallback;

      switch (values.action) {
        case "slack":
        case "discord":
          if (!text(values.url)) error(t("cli.flagMissing", { flag: "--url" }));
          action = { type: values.action, webhookUrl: text(values.url), template: text(values.template, "{{output}}") };
          break;
        case "webhook":
          if (!text(values.url)) error(t("cli.flagMissing", { flag: "--url" }));
          action = { type: "webhook", url: text(values.url), bodyTemplate: text(values.template, "{}") };
          break;
        case "command":
          if (!text(values.program)) error(t("cli.flagMissing", { flag: "--program" }));
          const pArgs = text(values.args).split(" ").filter(Boolean);
          action = { type: "command", program: text(values.program), args: pArgs, cwd: "workspace" };
          break;
        case "instruct":
          if (!values.agent) error(t("cli.instructAgentMissing"));
          const instrAgent = agentByName(String(values.agent));
          if (!instrAgent) error(t("cli.agentNotFound", { name: String(values.agent) }));
          action = { type: "instruct", agentId: instrAgent.id, template: text(values.template, "{{output}}") };
          break;
        case "notify":
          action = { type: "notify", title: "Aviso", template: text(values.template, "{{output}}") };
          break;
      }
      // After the switch rather than in a `default`: this is the one place that decides a hook
      // cannot be built, and saying it here is also what lets the type stop being nullable.
      if (!action) error(t("cli.unknownAction"));

      // Built up as the flags are read, which is why it is not the Hook's own optional field yet.
      const filter: NonNullable<import("@/types").Hook["filter"]> = {};
      if (values["filter-agent"]) {
        const a = agentByName(String(values["filter-agent"]));
        if (!a) error(t("cli.filterAgentNotFound"));
        filter.agentId = a.id;
      }
      if (values["filter-project"]) {
        const p = store.config.projects.find(x => x.name.toLowerCase() === String(values["filter-project"]).toLowerCase());
        if (!p) error(t("cli.filterProjectNotFound"));
        filter.projectId = p.id;
      }

      const h: import("@/types").Hook = {
        id: crypto.randomUUID(),
        name,
        event: values.event as import("@/types").HookEvent,
        enabled: true,
        action,
        filter: Object.keys(filter).length > 0 ? filter : undefined
      };
      
      store.upsertHook(h);
      await store.saveConfig();
      print(h, t("cli.hookSaved"));
      process.exit(0);
    } else if (sub === "remove") {
      const name = args[2];
      const h = store.config.hooks?.find(x => x.name === name);
      if (!h) error(t("cli.notFound"));
      store.removeHook(h.id);
      await store.saveConfig();
      print({ ok: true }, t("cli.hookRemoved"));
      process.exit(0);
    } else if (sub === "enable" || sub === "disable") {
      const name = args[2];
      const h = store.config.hooks?.find(x => x.name === name);
      if (!h) error(t("cli.notFound"));
      store.toggleHook(h.id, sub === "enable");
      await store.saveConfig();
      print({ ok: true }, `Hook ${sub === "enable" ? "habilitado" : "deshabilitado"}.`);
      process.exit(0);
    } else if (sub === "test") {
      const name = args[2];
      const h = store.config.hooks?.find(x => x.name === name);
      if (!h) error(t("cli.notFound"));
      await store.testHook(h.id);
      await new Promise(r => setTimeout(r, 500));
      const msgs = useAppStore.getState().messages;
      for (const msg of msgs) {
        if (msg.kind === "system") {
          console.log(`[system] ${msg.text}`);
        }
      }
      print({ ok: true }, "Test finalizado.");
      process.exit(0);
    }
  }

  if (first === "mcp") {
    const sub = args[1] || "list";
    if (sub === "list") {
      const sanitized = store.config.mcpServers.map(s =>
        s.headers ? { ...s, headers: Object.fromEntries(Object.keys(s.headers).map(k => [k, "***"])) } : s
      );
      print(sanitized, store.config.mcpServers.map(s => `- ${s.name} (${s.transport})`).join("\n"));
      process.exit(0);
    } else if (sub === "sync") {
      const res = await syncMcpToAntigravity(store.config.mcpServers);
      print(res, res.success ? `Sync ok: ${res.added} agregados, ${res.removed} removidos` : `Error: ${res.error}`);
      process.exit(res.success ? 0 : 1);
    } else if (sub === "add" || sub === "edit") {
      const targetName = args[2];
      if (!targetName || targetName.startsWith("-")) error(t("cli.nameMissing"));

      const { values } = parseArgs({
        args: args.slice(3),
        options: {
          command: { type: "string" },
          args: { type: "string" },
          url: { type: "string" },
          agents: { type: "string" },
        },
        strict: false
      });
      
      let mcp = store.config.mcpServers.find(s => s.name.toLowerCase() === targetName.toLowerCase());
      if (sub === "add" && mcp) error(t("cli.mcpExists"));
      if (sub === "edit" && !mcp) error(t("cli.mcpNotFound"));

      const env: Record<string, string> = mcp?.env || {};
      for (let i = 3; i < args.length; i++) {
        if (args[i] === "--env" && args[i+1]) {
          const [k, v] = args[i+1].split("=");
          if (k && v !== undefined) env[k] = v;
          i++;
        }
      }

      const headers = mcpHeadersFromArgs(args, mcp?.headers);

      let enabledFor: "all" | string[] = mcp ? mcp.enabledFor : "all";
      if (values.agents) {
        if (values.agents === "all") enabledFor = "all";
        else {
          enabledFor = String(values.agents).split(",").map((n: string) => {
            const a = agentByName(n);
            if (!a) error(t("cli.agentNotFound", { name: n }));
            return a.id;
          });
        }
      }

      const transport = values.url ? "http" : (values.command ? "stdio" : (mcp?.transport || "stdio"));
      if (transport === "stdio" && (headers || args.includes("--header"))) {
        error(t("cli.mcpHeadersOnlyHttp"));
      }
      
      const newMcp: McpServer = {
        id: mcp ? mcp.id : crypto.randomUUID(),
        name: targetName,
        transport,
        command: values.command !== undefined ? String(values.command) : mcp?.command,
        args: values.args !== undefined ? String(values.args).split(" ") : mcp?.args,
        url: values.url !== undefined ? String(values.url) : mcp?.url,
        env: Object.keys(env).length > 0 ? env : undefined,
        headers,
        enabledFor
      };

      store.upsertMcpServer(newMcp);
      await store.saveConfig();
      const sanitizedMcp = newMcp.headers
        ? {
            ...newMcp,
            headers: Object.fromEntries(Object.keys(newMcp.headers).map(k => [k, "***"])),
          }
        : newMcp;
      print(sanitizedMcp, `MCP ${sub} ok`);
      process.exit(0);
    } else if (sub === "remove") {
      const name = args[2];
      const mcp = store.config.mcpServers.find(a => a.name.toLowerCase() === name.toLowerCase());
      if (!mcp) error(t("cli.notFound"));
      store.removeMcpServer(mcp.id);
      await store.saveConfig();
      print({ id: mcp.id }, t("cli.removed"));
      process.exit(0);
    }
  }

  if (first === "history" || first === "status") {
    const { values: hv, positionals: hp } = parseArgs({
      args: args.slice(1),
      options: {
        workspace: { type: "string", short: "w" },
        project: { type: "string", short: "p" },
        limit: { type: "string" },
        json: { type: "boolean" },
      },
      allowPositionals: true,
      strict: false,
    });
    const agentName = (id: string) => agentById(id)?.name || id;
    const fmt = (ts: number) => new Date(ts).toLocaleString(locale, { hour12: false });
    const oneLine = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

    if (first === "status") {
      // A fresh process only sees what was persisted by the app/CLI that ran the tasks.
      for (const p of store.config.projects) await loadHistory(p.id);
      const state = useAppStore.getState();
      const report = state.config.projects.map(p => {
        const runs = Object.values(state.runs).filter(r => r.projectId === p.id);
        const running = runs.filter(r => r.status === "running");
        const last = runs.sort((a, b) => b.startedAt - a.startedAt)[0];
        return { project: p.name, workspaceDir: p.workspaceDir, runs: runs.length, running: running.map(r => ({ agent: agentName(r.agentId), task: oneLine(r.prompt, 80) })), last: last ? { agent: agentName(last.agentId), status: last.status, at: last.startedAt } : null };
      });
      if (jsonOutput || hv.json) { console.log(JSON.stringify(report)); process.exit(0); }
      if (report.length === 0) console.log(t("cli.noProjects"));
      for (const r of report) {
        console.log(`- ${r.project} (${r.workspaceDir}): ${r.runs} runs guardados`);
        for (const x of r.running) console.log("    " + t("cli.runningPerSave", { agent: x.agent, task: x.task }));
        if (r.last) console.log("    " + t("cli.lastRun", { agent: r.last.agent, status: r.last.status, when: fmt(r.last.at) }));
      }
      process.exit(0);
    }

    const projectId = resolveProjectId(hv.project as string | undefined, hv.workspace as string | undefined);
    await loadHistory(projectId);
    const state = useAppStore.getState();
    const runs = Object.values(state.runs).filter(r => r.projectId === projectId).sort((a, b) => b.startedAt - a.startedAt);

    if (hp[0] === "show") {
      const prefix = hp[1];
      if (!prefix) error(t("cli.usage", { usage: "ainess history show <runId>" }));
      const run = runs.find(r => r.id.startsWith(prefix));
      if (!run) error(t("cli.runNotFound", { prefix }));
      if (jsonOutput || hv.json) { console.log(JSON.stringify(run)); process.exit(0); }
      console.log(`Run ${run.id}\nAgente: ${agentName(run.agentId)}  Estado: ${run.status}  Ronda: ${run.round}  Inicio: ${fmt(run.startedAt)}${run.endedAt ? `  Fin: ${fmt(run.endedAt)}` : ""}`);
      console.log(`\n${t("cli.runDetail")}\n${run.prompt}\n\n${t("cli.runOutput")}\n${run.output}\n\n${t("cli.runRawLines", { n: run.rawLines.length })}\n${run.rawLines.join("\n")}`);
      process.exit(0);
    }

    const limit = parseInt(String(hv.limit || "20"), 10) || 20;
    const shown = runs.slice(0, limit);
    if (jsonOutput || hv.json) { console.log(JSON.stringify(shown)); process.exit(0); }
    if (shown.length === 0) console.log(t("cli.noRuns"));
    for (const r of shown) {
      console.log(`${fmt(r.startedAt)}  ${r.id.slice(0, 8)}  ${agentName(r.agentId)} [${r.status}] r${r.round}`);
      console.log(`    > ${oneLine(r.prompt, 80)}`);
      if (r.output) console.log(`    < ${oneLine(r.output, 120)}`);
    }
    process.exit(0);
  }

  if (first === "usage") {
    const { values: uv } = parseArgs({
      args: args.slice(1),
      options: {
        workspace: { type: "string", short: "w" },
        project: { type: "string", short: "p" },
        by: { type: "string" },
        days: { type: "string" },
        json: { type: "boolean" },
      },
      strict: false,
    });

    const by = String(uv.by ?? "agent");
    if (by !== "agent" && by !== "day") error('--by acepta "agent" o "day".');
    const days = parseInt(String(uv.days ?? "30"), 10);
    if (isNaN(days) || days < 1 || days > 365) error(t("cli.daysRange"));
    const labels = { tokens: t("cli.usage.tokens"), premiumRequests: t("cli.usage.premiumRequests") };
    const agentName = (id: string) => agentById(id)?.name || id.slice(0, 8);

    const filterProject = uv.project as string | undefined;
    const filterWorkspace = uv.workspace as string | undefined;
    let projects = store.config.projects;
    if (filterProject || filterWorkspace) {
      const pid = resolveProjectId(filterProject, filterWorkspace);
      projects = store.config.projects.filter(p => p.id === pid);
    }
    
    for (const p of projects) await loadHistory(p.id);
    const state = useAppStore.getState();

    const jsonResult: Record<string, unknown> = {};
    const allProjectRuns = [];

    for (const p of projects) {
      const projectRuns = runsOfProject(state.runs, p.id).filter(r => hasUsage(r.usage));
      allProjectRuns.push(...projectRuns);
      
      const pTotals = totalsOf(projectRuns);
      const byAgentData = totalsByAgent(projectRuns);
      const byDayData = totalsByDay(projectRuns, days, Date.now());

      if (jsonOutput || uv.json) {
        jsonResult[p.id] = {
          name: p.name,
          totals: pTotals,
          byAgent: byAgentData,
          byDay: byDayData,
        };
      } else {
        console.log(p.name);
        if (projectRuns.length === 0) {
          console.log(t("cli.usage.noData") + "\n");
          continue;
        }
        
        if (by === "day") {
          for (const d of byDayData) {
            if (d.totals.runs > 0) {
              const text = formatUsage(d.totals, locale, labels);
              if (text) console.log(`${d.day}  ${text}`);
            }
          }
        } else {
          // by agent
          const entries = Object.entries(byAgentData).sort((a, b) => {
            if (b[1].costUsd !== a[1].costUsd) return b[1].costUsd - a[1].costUsd;
            return totalTokens(b[1]) - totalTokens(a[1]);
          });
          for (const [id, totals] of entries) {
            if (totals.runs > 0) {
              const text = formatUsage(totals, locale, labels);
              if (text) console.log(`${agentName(id)}  ${text}`);
            }
          }
        }
        console.log("");
      }
    }

    if (jsonOutput || uv.json) {
      if (!filterProject && !filterWorkspace) {
        jsonResult.total = totalsOf(allProjectRuns);
      }
      console.log(JSON.stringify(jsonResult));
    } else {
      if (!filterProject && !filterWorkspace) {
        console.log(t("cli.usage.total"));
        const text = formatUsage(totalsOf(allProjectRuns), locale, labels);
        if (text) console.log(text);
      }
    }
    process.exit(0);
  }

  if (first === "remote") {
    const sub = args[1] || "url";
    const remote = store.config.remote;
    if (sub === "url") {
      if (args.includes("--tunnel")) {
        // The tunnel only exists inside a running `ainess serve --tunnel` (or the app).
        const st = await nodeTransport.tunnelStatus();
        if (!st.running || !st.url) {
          error(t("cli.noTunnelHere"));
        }
        const turl = tunnelUrl(st.url!, remote.token);
        print({ url: turl, provider: st.provider }, turl);
        process.exit(0);
      }
      const url = remoteUrl(localIp(), remote.port, remote.token);
      print({ url, port: remote.port, ip: localIp(), enabled: remote.enabled }, url);
      process.exit(0);
    }
    if (sub === "token") {
      if (args.includes("--regenerate")) {
        store.updateConfig({ remote: { ...remote, token: crypto.randomUUID() } });
        await store.saveConfig();
        print({ ok: true }, "Token regenerado. Nueva URL:\n" + remoteUrl(localIp(), remote.port, useAppStore.getState().config.remote.token));
      } else {
        print({ token: remote.token }, remote.token);
      }
      process.exit(0);
    }
    error(t("cli.usage", { usage: "ainess remote url | token [--regenerate]" }));
  }

  if (first === "serve") {
    const { values: sv } = parseArgs({
      args: args.slice(1),
      options: {
        port: { type: "string" },
        workspace: { type: "string", short: "w" },
        project: { type: "string", short: "p" },
        "tunnel-domain": { type: "string" },
        "tunnel-name": { type: "string" },
      },
      allowPositionals: true,
      strict: false,
    });
    const projectId = resolveProjectId(sv.project as string | undefined, sv.workspace as string | undefined);
    store.setCurrentProject(projectId);
    for (const p of store.config.projects) await loadHistory(p.id);
    const port = sv.port ? parseInt(String(sv.port), 10) : undefined;
    try {
      // With `remote.enabled` the store already started the server on the config port at init;
      // an explicit --port must win (the app may own the config port), so restart on it.
      if (port !== undefined && useAppStore.getState().remoteStatus.running) await store.stopRemote();
      await store.startRemote(port);
    } catch (e) {
      error(t("cli.serverFailed", { error: e instanceof Error ? e.message : String(e) }));
    }
    const st = useAppStore.getState().remoteStatus;

    // `--tunnel [cloudflared|ngrok]`: publish the local server on a public URL.
    let publicUrl: string | undefined;
    const tunnelIdx = args.indexOf("--tunnel");
    if (tunnelIdx !== -1) {
      const arg = args[tunnelIdx + 1];
      const provider = isTunnelProvider(arg) ? arg : store.config.remote.tunnel.provider;
      const domainOverride = sv["tunnel-domain"] as string | undefined;
      const tunnelNameOverride = sv["tunnel-name"] as string | undefined;
      const domain = domainOverride !== undefined ? normalizeDomain(domainOverride) : store.config.remote.tunnel.domain;
      const tunnelName = tunnelNameOverride !== undefined ? tunnelNameOverride.trim() : store.config.remote.tunnel.tunnelName;
      store.updateConfig({ remote: { ...store.config.remote, tunnel: { provider, enabled: true, domain, tunnelName } } });
      try {
        await store.startTunnel();
        publicUrl = tunnelUrl(useAppStore.getState().tunnelStatus.url ?? "", store.config.remote.token);
      } catch (e) {
        error(t("cli.tunnelFailed", { error: e instanceof Error ? e.message : String(e) }));
      }
    }

    if (jsonOutput) console.log(JSON.stringify({ url: st.url, ip: st.ip, port: port ?? store.config.remote.port, tunnelUrl: publicUrl }));
    else {
      console.log(`Servidor remoto escuchando en ${st.ip}:${port ?? store.config.remote.port}`);
      if (publicUrl) console.log(t("cli.publicTunnel", { url: publicUrl }));
      console.log(t("cli.openFromPhone", { url: st.url ?? "" }));
    }
    // Live feed of what the phone triggers, same format as `run`.
    const printedIds = new Set<string>(useAppStore.getState().messages.map(m => m.id));
    useAppStore.subscribe((state) => {
      for (const m of state.messages) {
        if (printedIds.has(m.id) || m.kind === "text") continue;
        printedIds.add(m.id);
        if (jsonOutput) { console.log(JSON.stringify(m)); continue; }
        const from = m.fromAgentId === "user" ? "user" : agentById(m.fromAgentId)?.name || m.fromAgentId;
        console.log(`${new Date(m.ts).toLocaleTimeString("en-GB", { hour12: false })}  ${from}  [${m.kind}]  ${m.text.replace(/\s+/g, " ").slice(0, 160)}`);
      }
    });
    const shutdown = () => { void store.stopRemote().finally(() => flushAll().finally(() => process.exit(0))); };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    process.on("exit", () => { killAllSync(); killTunnelSync(); });
    setInterval(() => {}, 1 << 30); // keep the event loop alive
    return;
  }

  if (first === "approvals") {
    const sub = args[1] || "list";
    for (const p of store.config.projects) await loadHistory(p.id);
    const state = useAppStore.getState();
    const name = (id?: string) => agentById(id)?.name || id || "";
    const pending = pendingApprovals(state.approvals, state.config.projects);
    if (sub === "list") {
      if (jsonOutput) { console.log(JSON.stringify(pending)); process.exit(0); }
      if (pending.length === 0) console.log("No hay aprobaciones pendientes.");
      for (const a of pending) {
        const proj = state.config.projects.find(p => p.id === a.projectId)?.name || a.projectId;
        console.log(`${a.id.slice(0, 8)}  [${proj}]  ${name(a.agentId)} → ${name(a.toAgentId)}  ${new Date(a.createdAt).toLocaleTimeString(locale, { hour12: false })}`);
        console.log(`    ${a.payload.prompt.replace(/\s+/g, " ").slice(0, 160)}`);
      }
      process.exit(0);
    }
    if (sub === "approve" || sub === "reject") {
      const prefix = args[2];
      if (!prefix) error(`Uso: ainess approvals ${sub} <id> [--note "..."]`);
      const { values: av } = parseArgs({ args: args.slice(3), options: { note: { type: "string" } }, strict: false });
      const target = pending.find(a => a.id.startsWith(prefix));
      if (!target) error(t("cli.approvalNotFound", { prefix }));
      // Deciding may launch runs in THIS process (the child, or the parent's continuation
      // after a rejection): stay alive until nothing is running any more.
      const projectId = target.projectId;
      const decidedAt = Date.now();
      store.setCurrentProject(projectId);
      if (sub === "reject") {
        await store.reject(target.id, av.note as string | undefined);
        print({ ok: true, id: target.id }, `Rechazada: ${target.summary}. Continuando en este proceso…`);
      } else {
        await store.approve(target.id, av.note as string | undefined);
        print({ ok: true, id: target.id }, `Aprobada: ${target.summary}. Ejecutando en este proceso…`);
      }
      await new Promise<void>(resolve => {
        const check = () => {
          const running = Object.values(useAppStore.getState().runs).some(r => r.projectId === projectId && r.status === "running");
          if (!running) resolve(); else setTimeout(check, 500);
        };
        setTimeout(check, 1000);
      });
      const after = useAppStore.getState();
      const last = after.messages.filter(m => m.projectId === projectId && m.kind === "result" && m.toAgentId === "user" && m.ts >= decidedAt).pop();
      if (last) console.log(`\n${last.text}`);
      const stillPending = Object.values(after.approvals).filter(a => a.status === "pending" && a.projectId === projectId);
      for (const a of stillPending) console.log(t("cli.newPendingApproval", { id: a.id.slice(0, 8), summary: a.summary }));
      await flushAll();
      process.exit(0);
    }
    error(t("cli.usage", { usage: "ainess approvals list | approve <id> [--note] | reject <id> [--note]" }));
  }

  if (first === "projects") {
    const sub = args[1] || "list";
    if (sub === "list") {
      print(store.config.projects, store.config.projects.map(p => `- ${p.name}: ${p.workspaceDir}`).join("\n"));
      process.exit(0);
    } else if (sub === "add") {
      const name = args[2];
      if (!name || name.startsWith("-")) error(t("cli.nameMissing"));
      const dirIdx = args.indexOf("--dir");
      if (dirIdx === -1 || !args[dirIdx+1]) error(t("cli.dirMissing"));
      const workspaceDir = path.resolve(args[dirIdx+1]);
      if (store.config.projects.find(p => p.name.toLowerCase() === name.toLowerCase())) error(t("cli.projectExists"));
      store.addProject({ name, workspaceDir });
      await store.saveConfig();
      print({ name, workspaceDir }, t("cli.projectAdded", { name }));
      process.exit(0);
    } else if (sub === "remove") {
      const name = args[2];
      const p = store.config.projects.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (!p) error(t("cli.notFound"));
      store.removeProject(p.id);
      await store.saveConfig();
      print({ id: p.id }, t("cli.projectRemoved"));
      process.exit(0);
    }
  }

  if (first === "context") {
    const sub = args[1] || "show";
    // The context belongs to one project now, so this needs to know which — same -p/-w as the rest
    // of the CLI, defaulting to the project of the directory you are standing in.
    const ctxProject = valueOf(args, "--project", "-p");
    const ctxWorkspace = valueOf(args, "--workspace", "-w");
    if (sub === "show") {
      const project = projectById(resolveProjectId(ctxProject, ctxWorkspace));
      const text = project?.sharedContext ?? "";
      print({ project: project?.name, context: text }, text);
      process.exit(0);
    } else if (sub === "clear") {
      const projectId = resolveProjectId(ctxProject, ctxWorkspace);
      store.setSharedContext(projectId, "");
      await store.saveConfig();
      print({ ok: true, project: projectById(projectId)?.name }, "Context cleared");
      process.exit(0);
    } else if (sub === "set") {
      const projectId = resolveProjectId(ctxProject, ctxWorkspace);
      let text = "";
      const fileIdx = args.indexOf("--file");
      if (fileIdx >= 0 && args[fileIdx+1]) {
        text = fs.readFileSync(args[fileIdx+1], "utf-8");
      } else {
        text = fs.readFileSync(0, "utf-8"); // stdin
      }
      store.setSharedContext(projectId, text);
      await store.saveConfig();
      print({ ok: true, project: projectById(projectId)?.name }, "Context set");
      process.exit(0);
    }
  }

  /** `--flag value` / `-f value`, for the commands that read their arguments by hand. */
  function valueOf(argv: string[], long: string, short: string): string | undefined {
    const at = argv.findIndex(a => a === long || a === short);
    return at >= 0 ? argv[at + 1] : undefined;
  }

  function projectById(id: string) {
    return useAppStore.getState().config.projects.find(p => p.id === id);
  }

  // Resolves (or creates) the project for -p/-w, mirroring the run command.
  function resolveProjectId(projectName?: string, workspace?: string): string {
    if (projectName) {
      const p = store.config.projects.find(x => x.name.toLowerCase() === projectName.toLowerCase());
      if (!p) error(t("cli.projectNotFound", { name: projectName }));
      return p.id;
    }
    const targetDir = workspace ? path.resolve(workspace) : process.cwd();
    let p = store.config.projects.find(x => path.resolve(x.workspaceDir) === targetDir);
    if (!p) {
      store.addProject({ name: path.basename(targetDir) || "Proyecto", workspaceDir: targetDir });
      p = useAppStore.getState().config.projects.find(x => path.resolve(x.workspaceDir) === targetDir);
    }
    return p!.id;
  }

  if (first === "chat") {
    const { values: cv, positionals: cp } = parseArgs({
      args: args.slice(1),
      options: {
        agent: { type: "string", short: "a" },
        shared: { type: "string" },
        workspace: { type: "string", short: "w" },
        project: { type: "string", short: "p" },
        name: { type: "string" },
        model: { type: "string" },
      },
      allowPositionals: true,
      strict: false,
    });
    const projectId = resolveProjectId(cv.project as string | undefined, cv.workspace as string | undefined);
    // A chat runs inside a project, so its participants come from that project's team.
    const findAgent = (name: string) => {
      const a = projectAgentByName(projectId, name);
      if (!a) error(t("cli.agentNamedNotFoundInProject", { name }));
      return a;
    };
    store.setCurrentProject(projectId);

    // Participants from --shared "A:rol,B:rol" or -a <agente>.
    let participants: ChatParticipant[] = [];
    if (cv.shared) {
      participants = String(cv.shared).split(",").filter(Boolean).map(part => {
        const [name, ...roleParts] = part.split(":");
        return { agentId: findAgent(name).id, role: roleParts.join(":").trim() || "participante", model: cv.model as string | undefined };
      });
    } else if (cv.agent) {
      participants = [{ agentId: findAgent(String(cv.agent)).id, role: "asistente", model: cv.model as string | undefined }];
    }

    const isSend = cp[0] === "send";
    const chatName = isSend ? cp[1] : (cv.name as string | undefined);
    if (isSend && !chatName) error("Uso: ainess chat send <nombre-chat> \"texto\"");

    // Find an existing chat by name in this project, or create one from the participants.
    let chat = chatName
      ? useAppStore.getState().config.chats.find(c => c.projectId === projectId && c.name.toLowerCase() === chatName.toLowerCase())
      : undefined;
    if (!chat) {
      if (participants.length === 0) {
        error(isSend ? t("cli.chatNotFound", { name: chatName ?? "" }) : t("cli.chatNeedsAgent"));
      }
      const names = participants.map(p => agentById(p.agentId)?.name).join(", ");
      const id = store.createChat({
        projectId,
        name: chatName || `CLI: ${names}`,
        mode: participants.length > 1 ? "shared" : "individual",
        participants,
      });
      await store.saveConfig();
      chat = useAppStore.getState().config.chats.find(c => c.id === id)!;
    }
    await store.loadChatMessages(chat.id);

    const agentLabel = (agentId: string) => {
      const a = agentById(agentId);
      const role = chat!.participants.find(p => p.agentId === agentId)?.role;
      return `\x1b[36m${a?.name || agentId}\x1b[0m${role ? ` (${role})` : ""}`;
    };
    const printedIds = new Set<string>((useAppStore.getState().chatMessages[chat.id] || []).map(m => m.id));
    const flush = () => {
      for (const m of useAppStore.getState().chatMessages[chat!.id] || []) {
        if (printedIds.has(m.id) || m.status === "pending" || m.from === "user") continue;
        printedIds.add(m.id);
        if (jsonOutput) console.log(JSON.stringify(m));
        else console.log(`\n${agentLabel(m.from)}:\n${m.status === "error" ? "\x1b[31m" : ""}${m.text}\x1b[0m`);
      }
    };
    const runTurn = async (text: string) => {
      const chatId = chat!.id;
      await store.sendChatMessage(chatId, text);
      // Each participant's reply is printed as soon as its bubble closes.
      while (isChatActive(chatId)) {
        await new Promise(r => setTimeout(r, 300));
        flush();
      }
      flush();
    };

    process.on("SIGINT", () => { void store.stopChat(chat!.id); setTimeout(() => process.exit(130), 2000); });
    process.on("exit", () => killAllSync());

    if (isSend) {
      let text = cp.slice(2).join(" ");
      if (!text && !process.stdin.isTTY) text = fs.readFileSync(0, "utf-8").trim();
      if (!text) error(t("cli.messageTextMissing"));
      await runTurn(text);
      process.exit(0);
    }

    if (!jsonOutput) {
      const who = chat.participants.map(p => agentLabel(p.agentId)).join(", ");
      console.log(t("cli.chatHeader", { name: chat.name, who }));
    }
    if (!process.stdin.isTTY) {
      // Piped input: one turn per non-empty line, then exit.
      const lines = fs.readFileSync(0, "utf-8").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) await runTurn(line);
      process.exit(0);
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "vos> " });
    rl.prompt();
    rl.on("line", async (line) => {
      const text = line.trim();
      if (text === "/salir" || text === "/exit") { rl.close(); return; }
      if (text === "/nuevo") {
        useAppStore.setState(state => ({ chatSessions: { ...state.chatSessions, [chat!.id]: {} } }));
        console.log("Sesiones reiniciadas.");
      } else if (text) {
        rl.pause();
        await runTurn(text);
        rl.resume();
      }
      rl.prompt();
    });
    rl.on("close", () => process.exit(0));
    return;
  }

  const { values, positionals } = parseArgs({
    args,
    options: {
      agent: { type: "string", short: "a" },
      workspace: { type: "string", short: "w" },
      project: { type: "string", short: "p" },
      json: { type: "boolean" },
      quiet: { type: "boolean", short: "q" },
      "max-rounds": { type: "string" },
      preset: { type: "string" },
      model: { type: "string" },
      "auto-model": { type: "boolean" },
    },
    allowPositionals: true,
    strict: false
  });

  if (values["auto-model"] !== undefined) {
    store.updateConfig({ autoModel: Boolean(values["auto-model"]) });
  }

  // `run` may come after options (ainess -a X run "..."), so strip it wherever it is.
  let prompt = positionals[0] === "run" ? positionals.slice(1).join(" ") : positionals.join(" ");

  if (values.preset) {
    const presetObj = store.config.presets?.find(p => p.name === values.preset);
    if (!presetObj) error(t("cli.presetNotFound", { name: String(values.preset) }));
    prompt = presetObj.prompt + (prompt ? "\n" + prompt : "");
    if (!values.agent && presetObj.agentId) {
      const a = agentById(presetObj.agentId);
      if (a) values.agent = a.name;
    }
    if (!values.model && presetObj.model) {
      values.model = presetObj.model;
    }
  }

  if (!prompt && !process.stdin.isTTY) {
    try { prompt = fs.readFileSync(0, "utf-8").trim(); } catch {}
  }
  
  if (!prompt) {
    error(t("cli.promptMissing"));
  }

  // The team belongs to the project, so the project is resolved first.
  let projectId = "";
  if (values.project) {
    const p = store.config.projects.find(x => x.name.toLowerCase() === String(values.project).toLowerCase());
    if (!p) error(t("cli.projectNotFound", { name: String(values.project) }));
    projectId = p.id;
  } else {
    let targetDir = values.workspace ? path.resolve(String(values.workspace)) : process.cwd();
    let p = store.config.projects.find(x => path.resolve(x.workspaceDir) === targetDir);
    if (!p) {
      const pName = path.basename(targetDir) || "Proyecto";
      store.addProject({ name: pName, workspaceDir: targetDir });
      p = useAppStore.getState().config.projects.find(x => path.resolve(x.workspaceDir) === targetDir);
    }
    projectId = p!.id;
  }
  store.setCurrentProject(projectId);

  let agentId = "";
  const roots = selectRoots(live(), projectId);

  if (values.agent) {
    const a = projectAgentByName(projectId, String(values.agent));
    if (!a) error(t("cli.agentNamedNotFoundInProject", { name: String(values.agent) }));
    agentId = a.id;
  } else {
    const planner = roots.find(r => r.role === "planner");
    agentId = (planner || roots[0])?.id;
    if (!agentId) error(t("cli.noAgentsApplyFormation"));
  }

  if (values["max-rounds"]) store.setMaxRounds(parseInt(String(values["max-rounds"]), 10));

  const printedLengths = new Map<string, number>();

  useAppStore.subscribe((state, prevState) => {
    if (state.messages.length > prevState.messages.length || state.messages !== prevState.messages) {
      for (const msg of state.messages) {
        if (msg.projectId && msg.projectId !== projectId) continue;
        if (!prevState.messages.find(m => m.id === msg.id) || msg.kind === "text") {
          const prevLen = printedLengths.get(msg.id) || 0;
          if (msg.text.length > prevLen) {
            const delta = msg.text.substring(prevLen);
            printedLengths.set(msg.id, msg.text.length);
            
            if (values.json) {
              console.log(JSON.stringify(msg));
            } else if (!values.quiet || (msg.kind === "result" && msg.toAgentId === "user")) {
              if (msg.kind !== "text" || prevLen === 0) {
                const date = new Date(msg.ts).toLocaleTimeString("en-GB", { hour12: false });
                const fromName = msg.fromAgentId === "user" ? "user" : msg.fromAgentId === "system" ? "system" : agentById(msg.fromAgentId)?.name || msg.fromAgentId;
                const toName = msg.toAgentId === "user" ? "user" : msg.toAgentId ? agentById(msg.toAgentId)?.name || msg.toAgentId : "";
                
                let colorPrefix = "\x1b[0m";
                if (msg.kind === "error" || msg.kind === "stderr") colorPrefix = "\x1b[31m";
                else if (msg.kind === "delegation") colorPrefix = "\x1b[33m";
                else if (msg.kind === "tool") colorPrefix = "\x1b[90m";
                else if (msg.kind === "result") colorPrefix = "\x1b[32m";
                
                const agent = agentById(msg.fromAgentId);
                const agentColor = agent?.color ? `\x1b[36m` : `\x1b[34m`;

                const header = `${date}  ${agentColor}${fromName}\x1b[0m ${toName ? `? ${toName}` : ""}  [${msg.kind}]`;
                
                if (msg.kind === "text") {
                  process.stdout.write(`\n${header}\n${colorPrefix}${delta}\x1b[0m`);
                } else {
                  console.log(`${header}  ${colorPrefix}${msg.text}\x1b[0m`);
                }
              } else {
                process.stdout.write(delta);
              }
            }
          }
        }
      }
    }

    // A delegation waiting for approval parks the task: report it and exit so the user can
    // decide with `ainess approvals approve <id>` (or from the app / phone) later.
    if (state.approvals !== prevState.approvals) {
      const s = useAppStore.getState();
      const pending = Object.values(s.approvals).filter(a => a.status === "pending" && a.projectId === projectId);
      const running = Object.values(s.runs).some(r => r.projectId === projectId && r.status === "running");
      if (pending.length > 0 && !running) {
        if (!values.json) {
          console.log(`\n\x1b[33m${t("cli.waitingYourApproval")}\x1b[0m`);
          for (const a of pending) console.log(`  ${a.id.slice(0, 8)}  ${a.summary}`);
          console.log(t("cli.approveWith"));
        }
        void flushAll().finally(() => process.exit(3));
        return;
      }
    }

    if (prevState.activeTaskRunId[projectId] && !state.activeTaskRunId[projectId]) {
      if (!values.json) process.stdout.write("\n");
      // Whether the task failed is a question for the runs, not for the words in the feed: this
      // used to look for the Spanish text of "CLI not found", which stopped being the text at all
      // the day those messages started coming out of the dictionaries. Any run of this task ending
      // in error is the failure, wherever in the tree it happened.
      const rootRunId = prevState.activeTaskRunId[projectId] as string;
      const isError = Object.values(state.runs).some(r => r.rootRunId === rootRunId && r.status === "error");
      void flushAll().finally(() => process.exit(isError ? 1 : 0));
    }
  });

  process.on("SIGINT", () => {
    useAppStore.getState().stopAll();
    setTimeout(() => { void flushAll().finally(() => process.exit(130)); }, 2500);
  });
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") { killAllSync(); void flushAll().finally(() => process.exit(0)); }
  });
  process.on("exit", () => killAllSync());

  await useAppStore.getState().submitPrompt(prompt, agentId, projectId, { model: values.model as string | undefined });
}

main().catch(e => {
  console.error(e);
  process.exit(2);
});
