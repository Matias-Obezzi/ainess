// The configuration screens of the remote desktop page edit the host's config. What they are shown
// has its secrets masked, and what they send back is checked before it lands: unknown keys and
// shapes are refused, a masked secret is kept or replaced but never moved, and the fields that tie
// an item to a folder on the host stay the host's.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { nullTransport } from "@/lib/transport-null";
import { SECRET_MASK, prepareRemotePatch, remoteConfigView } from "@/lib/remote-settings";
import type { AppConfig, McpServer } from "@/types";

const agent = { id: "a1", name: "Claude", provider: "claude", role: "planner", parentId: null, autoApprove: false } as const;

function hostConfig(): AppConfig {
  return {
    version: 14,
    language: null,
    approveDelegations: false,
    remote: { enabled: true, port: 4710, token: "remote-token", tunnel: { provider: "cloudflared", enabled: false } },
    tray: { enabled: true, notifyApprovals: true, notifyResults: true },
    messaging: { telegram: { enabled: true, token: "bot-token", allowedChatIds: [], projectId: null } },
    boards: { github: { token: "ghp_secret" } },
    projects: [{
      id: "p1", name: "Uno", workspaceDir: "C:\\uno", createdAt: 1, agents: [{ ...agent }],
      room: { enabled: true, backend: "supabase", room: "sala", secret: "room-secret", supabaseUrl: "https://x.supabase.co", supabaseKey: "anon-key", allowed: {} },
    }],
    formations: [],
    defaultFormationId: null,
    lastProjectId: "p1",
    maxRounds: 6,
    maxConcurrentRuns: 0,
    skills: [{ id: "s1", name: "Una", content: "texto", enabledFor: "all", dir: "C:\\skills\\una", managed: true }],
    mcpServers: [
      { id: "m1", name: "GitHub", transport: "stdio", command: "npx", args: ["-y", "server"], env: { GITHUB_TOKEN: "ghp_env", HOME_REF: "${HOME}" }, enabledFor: "all" },
      { id: "m2", name: "Hosted", transport: "http", url: "https://mcp.example.com", headers: { Authorization: "Bearer xyz" }, enabledFor: "all" },
    ],
    plugins: [{ id: "pl1", name: "Plugin", dir: "C:\\plugins\\pl1", source: "git", enabled: true, commands: [], managed: true }],
    sharedContext: "",
    binaryOverrides: {},
    profile: { name: "", about: "", preferences: "" },
    presets: [],
    autoModel: false,
    hooks: [{ id: "h1", name: "Slack", event: "task.finished", enabled: true, action: { type: "slack", webhookUrl: "https://hooks.slack.com/T/B/secret", template: "{summary}" } }],
    chats: [],
    logLevel: "info",
    autoUpdateCheck: true,
    autoArchiveDoneDays: null,
  } as AppConfig;
}

describe("what the remote page is shown", () => {
  it("masks every secret and leaves out what it may not touch", () => {
    const view = remoteConfigView(hostConfig());
    const json = JSON.stringify(view);
    for (const secret of ["remote-token", "bot-token", "ghp_secret", "ghp_env", "Bearer xyz", "room-secret", "anon-key", "hooks.slack.com"]) {
      expect(json).not.toContain(secret);
    }
    expect(view).not.toHaveProperty("remote");
    expect(view).not.toHaveProperty("messaging");
    expect(view.boards?.github?.token).toBe(SECRET_MASK);
    expect(view.mcpServers?.[0].env).toEqual({ GITHUB_TOKEN: SECRET_MASK, HOME_REF: "${HOME}" });
    expect(view.projects[0].room?.secret).toBe(SECRET_MASK);
    // What is not secret is shown as it is.
    expect(view.mcpServers?.[1].url).toBe("https://mcp.example.com");
    expect(view.projects[0].agents[0].name).toBe("Claude");
  });

  it("masks only the values an extension's manifest calls sensitive, wherever they end up", () => {
    const config = hostConfig();
    const ext: McpServer = {
      id: "e1", name: "Ext", transport: "stdio", command: "node", args: ["index.js", "sk-live"], enabledFor: "all",
      extension: { id: "ext", dir: "C:\\ext", config: { api_key: "sk-live", folder: "C:\\data" } },
    };
    config.mcpServers.push(ext);
    const view = remoteConfigView(config, { e1: new Set(["api_key"]) });
    const shown = view.mcpServers!.find(s => s.id === "e1")!;
    expect(shown.extension?.config).toEqual({ api_key: SECRET_MASK, folder: "C:\\data" });
    expect(shown.args).toEqual(["index.js", SECRET_MASK]);
  });
});

describe("what the remote page may send back", () => {
  it("accepts a valid change and leaves the rest alone", () => {
    const result = prepareRemotePatch({ config: { profile: { name: "Bruno", about: "", preferences: "corto" }, maxRounds: 8 } }, hostConfig());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.config).toEqual({ profile: { name: "Bruno", about: "", preferences: "corto" }, maxRounds: 8 });
    expect(result.patch.projects).toEqual([]);
  });

  it("refuses keys it may not change, at the top and inside a project", () => {
    expect(prepareRemotePatch({ config: { remote: { token: "x" } } }, hostConfig())).toMatchObject({ ok: false, error: "unknown", field: "remote" });
    expect(prepareRemotePatch({ config: { messaging: {} } }, hostConfig())).toMatchObject({ ok: false, error: "unknown" });
    expect(prepareRemotePatch({ config: { binaryOverrides: { claude: "C:\\evil.exe" } } }, hostConfig())).toMatchObject({ ok: false, error: "unknown" });
    expect(prepareRemotePatch({ projects: [{ id: "p1", workspaceDir: "C:\\otro" }] }, hostConfig())).toMatchObject({ ok: false, error: "unknown", field: "projects.workspaceDir" });
    expect(prepareRemotePatch({ other: 1 }, hostConfig())).toMatchObject({ ok: false, error: "unknown", field: "other" });
  });

  it("refuses the wrong shape, and fields nobody has ever written", () => {
    expect(prepareRemotePatch({ config: { maxRounds: "8" } }, hostConfig())).toMatchObject({ ok: false, error: "invalid" });
    expect(prepareRemotePatch({ config: { maxRounds: 0 } }, hostConfig())).toMatchObject({ ok: false, error: "invalid" });
    expect(prepareRemotePatch({ config: { language: "xx" } }, hostConfig())).toMatchObject({ ok: false, error: "invalid" });
    expect(prepareRemotePatch({ config: { presets: [{ id: "1", name: "x", prompt: "y", run: "rm -rf" }] } }, hostConfig())).toMatchObject({ ok: false, error: "invalid" });
    const badAgent = { ...agent, provider: "not-a-cli" };
    expect(prepareRemotePatch({ projects: [{ id: "p1", agents: [badAgent] }] }, hostConfig())).toMatchObject({ ok: false, error: "invalid" });
    expect(prepareRemotePatch({ projects: [{ id: "no-such", name: "x" }] }, hostConfig())).toMatchObject({ ok: false, error: "invalid" });
  });

  it("keeps a field an older build wrote, as long as the host already has it there", () => {
    const config = hostConfig();
    (config.projects[0].agents[0] as unknown as Record<string, unknown>).legacyFlag = true;
    const agents = [{ ...config.projects[0].agents[0], name: "Renamed" }];
    expect(prepareRemotePatch({ projects: [{ id: "p1", agents }] }, config).ok).toBe(true);
  });

  it("puts a masked secret back as it was, and takes a new one", () => {
    const host = hostConfig();
    const view = remoteConfigView(host);
    const renamed = view.mcpServers!.map(s => (s.id === "m1" ? { ...s, name: "GitHub 2" } : s));
    const kept = prepareRemotePatch({ config: { mcpServers: renamed } }, host);
    expect(kept.ok).toBe(true);
    if (!kept.ok) return;
    expect(kept.patch.config.mcpServers![0]).toMatchObject({ name: "GitHub 2", env: { GITHUB_TOKEN: "ghp_env" } });
    expect(kept.patch.config.mcpServers![1].headers).toEqual({ Authorization: "Bearer xyz" });

    const replaced = view.mcpServers!.map(s => (s.id === "m2" ? { ...s, headers: { Authorization: "Bearer new" } } : s));
    const result = prepareRemotePatch({ config: { mcpServers: replaced } }, host);
    expect(result.ok && result.patch.config.mcpServers![1].headers).toEqual({ Authorization: "Bearer new" });

    const boards = prepareRemotePatch({ config: { boards: view.boards } }, host);
    expect(boards.ok && boards.patch.config.boards).toEqual({ github: { token: "ghp_secret" } });
  });

  it("does not let a masked secret follow a server to another address", () => {
    const host = hostConfig();
    const view = remoteConfigView(host);
    const moved = view.mcpServers!.map(s => (s.id === "m2" ? { ...s, url: "https://attacker.example" } : s));
    expect(prepareRemotePatch({ config: { mcpServers: moved } }, host)).toMatchObject({ ok: false, error: "secret" });
    // Nor into a server that did not exist.
    const fresh = [...view.mcpServers!, { id: "m3", name: "Nuevo", transport: "http", url: "https://x", headers: { A: SECRET_MASK }, enabledFor: "all" }];
    expect(prepareRemotePatch({ config: { mcpServers: fresh } }, host)).toMatchObject({ ok: false, error: "secret" });
    // A room changing backend address does not keep its secret either.
    const room = { ...view.projects[0].room!, supabaseUrl: "https://other.supabase.co" };
    expect(prepareRemotePatch({ projects: [{ id: "p1", room }] }, host)).toMatchObject({ ok: false, error: "secret" });
    const sameRoom = prepareRemotePatch({ projects: [{ id: "p1", room: { ...view.projects[0].room!, maxTurns: 4 } }] }, host);
    expect(sameRoom.ok && sameRoom.patch.projects[0].room).toMatchObject({ secret: "room-secret", supabaseKey: "anon-key", maxTurns: 4 });
    // A hook's webhook keeps its address while it stays a Slack hook.
    const hooks = prepareRemotePatch({ config: { hooks: view.hooks!.map(h => ({ ...h, enabled: false })) } }, host);
    expect(hooks.ok && (hooks.patch.config.hooks![0].action as { webhookUrl: string }).webhookUrl).toBe("https://hooks.slack.com/T/B/secret");
  });

  it("does not let a masked secret follow a stdio server to other arguments", () => {
    const host = hostConfig();
    const view = remoteConfigView(host);
    const swapped = view.mcpServers!.map(s => (s.id === "m1" ? { ...s, args: ["-y", "some-other-package"] } : s));
    expect(prepareRemotePatch({ config: { mcpServers: swapped } }, host)).toMatchObject({ ok: false, error: "secret" });
    // Same arguments in another order are other arguments too.
    const reordered = view.mcpServers!.map(s => (s.id === "m1" ? { ...s, args: ["server", "-y"] } : s));
    expect(prepareRemotePatch({ config: { mcpServers: reordered } }, host)).toMatchObject({ ok: false, error: "secret" });
    // With the secret typed again, the new arguments are still the desktop app's to set.
    const retyped = view.mcpServers!.map(s => (s.id === "m1" ? { ...s, args: ["-y", "other"], env: { GITHUB_TOKEN: "ghp_new", HOME_REF: "${HOME}" } } : s));
    expect(prepareRemotePatch({ config: { mcpServers: retyped } }, host)).toMatchObject({ ok: false, error: "locked", field: "mcpServers.args" });
    // Unchanged arguments still get the secret back.
    const same = prepareRemotePatch({ config: { mcpServers: view.mcpServers } }, host);
    expect(same.ok && same.patch.config.mcpServers![0]).toMatchObject({ args: ["-y", "server"], env: { GITHUB_TOKEN: "ghp_env" } });
  });

  it("puts back an extension secret that sits in the arguments, as long as the rest stays", () => {
    const host = hostConfig();
    host.mcpServers.push({
      id: "e1", name: "Ext", transport: "stdio", command: "node", args: ["index.js", "sk-live"], enabledFor: "all",
      extension: { id: "ext", dir: "C:\\ext", config: { api_key: "sk-live" } },
    });
    const view = remoteConfigView(host, { e1: new Set(["api_key"]) });
    const kept = prepareRemotePatch({ config: { mcpServers: view.mcpServers } }, host);
    expect(kept.ok && kept.patch.config.mcpServers!.find(s => s.id === "e1")!.args).toEqual(["index.js", "sk-live"]);
    const changed = view.mcpServers!.map(s => (s.id === "e1" ? { ...s, args: ["evil.js", SECRET_MASK] } : s));
    expect(prepareRemotePatch({ config: { mcpServers: changed } }, host)).toMatchObject({ ok: false, error: "secret" });
  });

  it("leaves the fields that point at a folder on the host to the host", () => {
    const host = hostConfig();
    const moved = [{ ...host.skills[0], dir: "C:\\Windows" }];
    expect(prepareRemotePatch({ config: { skills: moved } }, host)).toMatchObject({ ok: false, error: "hostOnly", field: "skills.dir" });
    const managed = [...host.skills, { id: "s2", name: "Otra", content: "x", enabledFor: "all", dir: "C:\\Users", managed: true }];
    expect(prepareRemotePatch({ config: { skills: managed } }, host)).toMatchObject({ ok: false, error: "hostOnly" });
    const ext = [...host.mcpServers, { id: "e9", name: "Ext", transport: "stdio", command: "node", enabledFor: "all", extension: { id: "x", dir: "C:\\evil" } }];
    expect(prepareRemotePatch({ config: { mcpServers: ext } }, host)).toMatchObject({ ok: false, error: "hostOnly", field: "mcpServers.extension" });
  });

  it("only switches installed plugins on and off, rebuilt from the host's records", () => {
    const host = hostConfig();
    const result = prepareRemotePatch({ config: { plugins: [{ ...host.plugins![0], enabled: false, dir: "C:\\elsewhere" }] } }, host);
    expect(result.ok && result.patch.config.plugins).toEqual([{ ...host.plugins![0], enabled: false }]);
    expect(prepareRemotePatch({ config: { plugins: [{ id: "new", enabled: true }] } }, host)).toMatchObject({ ok: false });
    // Uninstalling is leaving it out.
    const removed = prepareRemotePatch({ config: { plugins: [] } }, host);
    expect(removed.ok && removed.patch.config.plugins).toEqual([]);
  });

  it("reads null as taking a setting away, where that means something", () => {
    const unset = prepareRemotePatch({ config: { notificationSound: null }, projects: [{ id: "p1", budget: null }] }, hostConfig());
    expect(unset.ok).toBe(true);
    if (!unset.ok) return;
    expect("notificationSound" in unset.patch.config && unset.patch.config.notificationSound).toBeUndefined();
    expect(unset.patch.projects[0]).toEqual({ id: "p1", budget: undefined });
    // Null is a value of its own for the language (follow the system); the skills cannot go.
    expect(prepareRemotePatch({ config: { language: null } }, hostConfig())).toMatchObject({ ok: true, patch: { config: { language: null } } });
    expect(prepareRemotePatch({ config: { skills: null } }, hostConfig())).toMatchObject({ ok: false, error: "invalid" });
  });
});

describe("what only the desktop app may change", () => {
  /** The fixture, plus one of each thing that runs something on the host. */
  function host(): AppConfig {
    const config = hostConfig();
    config.approveDelegations = true;
    config.mcpServers.push({ id: "m4", name: "Local", transport: "stdio", command: "node", args: ["server.js"], enabledFor: "all" });
    config.hooks.push({ id: "h2", name: "Script", event: "task.finished", enabled: true, action: { type: "command", program: "notify.exe", args: ["{summary}"], cwd: "workspace" } });
    config.plannerPermissions = { presets: { git: true, install: false }, allow: ["docker ps"], deny: ["git push"] };
    config.formations = [{ id: "f1", name: "Equipo", agents: [{ ...agent }] }];
    const project = config.projects[0];
    project.agents.push({ id: "a2", name: "Custom", provider: "custom", role: "implementer", parentId: "a1", autoApprove: true, customCommand: { program: "agy", args: ["--prompt", "{prompt}"] } });
    project.verify = [{ id: "v1", label: "test", program: "npm", args: ["test"] }];
    project.commands = [{ id: "c1", label: "dev", command: "npm run dev" }];
    project.room!.enabled = false;
    project.room!.allowed = { mA: "Laptop" };
    return config;
  }

  const send = (patch: unknown, config = host()) => prepareRemotePatch(patch, config);
  const view = (config = host()) => remoteConfigView(config);
  const servers = (map: (s: McpServer) => McpServer | null, config = host()) =>
    view(config).mcpServers!.map(map).filter((s): s is McpServer => s !== null);

  it("lets every locked field go back as it was: the page sends whole objects", () => {
    const config = host();
    const shown = remoteConfigView(config);
    const project = shown.projects[0];
    const result = send({
      config: {
        mcpServers: shown.mcpServers, hooks: shown.hooks, plannerPermissions: shown.plannerPermissions,
        formations: shown.formations, approveDelegations: shown.approveDelegations,
      },
      projects: [{ id: "p1", agents: project.agents, verify: project.verify, commands: project.commands, room: project.room }],
    }, config);
    expect(result).toMatchObject({ ok: true });
  });

  it("does not add a local MCP server nor change what one runs", () => {
    const stdio = { id: "m5", name: "Nuevo", transport: "stdio", command: "calc.exe", enabledFor: "all" };
    expect(send({ config: { mcpServers: [...view().mcpServers!, stdio] } })).toMatchObject({ ok: false, error: "locked", field: "mcpServers.transport" });
    expect(send({ config: { mcpServers: servers(s => (s.id === "m4" ? { ...s, command: "evil.exe" } : s)) } })).toMatchObject({ error: "locked", field: "mcpServers.command" });
    expect(send({ config: { mcpServers: servers(s => (s.id === "m4" ? { ...s, args: ["other.js"] } : s)) } })).toMatchObject({ error: "locked", field: "mcpServers.args" });
    expect(send({ config: { mcpServers: servers(s => (s.id === "m4" ? { ...s, transport: "http", url: "https://x" } : s)) } })).toMatchObject({ error: "locked", field: "mcpServers.transport" });
    // The environment is locked whole, not only its secrets: NODE_OPTIONS runs code too.
    expect(send({ config: { mcpServers: servers(s => (s.id === "m4" ? { ...s, env: { NODE_OPTIONS: "--require C:\\evil.js" } } : s)) } })).toMatchObject({ error: "locked", field: "mcpServers.env" });
    expect(send({ config: { mcpServers: servers(s => (s.id === "m1" ? { ...s, env: { ...s.env, EXTRA: "1" } } : s)) } })).toMatchObject({ error: "locked", field: "mcpServers.env" });
    expect(send({ config: { mcpServers: servers(s => (s.id === "m2" ? { ...s, env: { PATH: "C:\\evil" } } : s)) } })).toMatchObject({ error: "locked", field: "mcpServers.env" });
  });

  it("does not change what an extension is given", () => {
    const config = host();
    config.mcpServers.push({ id: "e1", name: "Ext", transport: "stdio", command: "node", args: ["index.js"], enabledFor: "all", extension: { id: "ext", dir: "C:\\ext", config: { folder: "C:\\data" } } });
    const changed = servers(s => (s.id === "e1" ? { ...s, extension: { ...s.extension!, config: { folder: "C:\\" } } } : s), config);
    expect(send({ config: { mcpServers: changed } }, config)).toMatchObject({ error: "locked", field: "mcpServers.extension.config" });
  });

  it("still renames, switches off, deletes and adds remote MCP servers", () => {
    const renamed = servers(s => (s.id === "m4" ? { ...s, name: "Otro", enabledFor: [] } : s));
    expect(send({ config: { mcpServers: renamed } })).toMatchObject({ ok: true });
    expect(send({ config: { mcpServers: servers(s => (s.id === "m4" ? null : s)) } })).toMatchObject({ ok: true });
    const http = { id: "m5", name: "Hosted 2", transport: "http", url: "https://mcp2.example.com", headers: { Authorization: "Bearer typed" }, enabledFor: "all" };
    expect(send({ config: { mcpServers: [...view().mcpServers!, http] } })).toMatchObject({ ok: true });
    // A new address, with its secret typed again, as before.
    const moved = servers(s => (s.id === "m2" ? { ...s, url: "https://other.example", headers: { Authorization: "Bearer typed" } } : s));
    expect(send({ config: { mcpServers: moved } })).toMatchObject({ ok: true });
  });

  it("does not create a command hook nor change what one runs, but switches it off or deletes it", () => {
    const hooks = () => view().hooks!;
    const created = [...hooks(), { id: "h3", name: "Run", event: "task.finished", enabled: true, action: { type: "command", program: "calc.exe", args: [] } }];
    expect(send({ config: { hooks: created } })).toMatchObject({ ok: false, error: "locked", field: "hooks.command" });
    const edited = hooks().map(h => (h.id === "h2" ? { ...h, action: { type: "command", program: "notify.exe", args: ["{summary}", "--more"], cwd: "workspace" } } : h));
    expect(send({ config: { hooks: edited } })).toMatchObject({ error: "locked", field: "hooks.command" });
    // A Slack hook turned into a command is a command hook created.
    const turned = hooks().map(h => (h.id === "h1" ? { ...h, action: { type: "command", program: "calc.exe", args: [] } } : h));
    expect(send({ config: { hooks: turned } })).toMatchObject({ error: "locked", field: "hooks.command" });

    expect(send({ config: { hooks: hooks().map(h => (h.id === "h2" ? { ...h, enabled: false, name: "Off" } : h)) } })).toMatchObject({ ok: true });
    expect(send({ config: { hooks: hooks().filter(h => h.id !== "h2") } })).toMatchObject({ ok: true });
    const notify = hooks().map(h => (h.id === "h2" ? { ...h, action: { type: "notify", title: "x", template: "y" } } : h));
    expect(send({ config: { hooks: notify } })).toMatchObject({ ok: true });
  });

  it("does not change a custom agent's command, nor let an agent skip its approvals", () => {
    const agents = () => view().projects[0].agents;
    const withAgent = (id: string, patch: Record<string, unknown>) => ({ projects: [{ id: "p1", agents: agents().map(a => (a.id === id ? { ...a, ...patch } : a)) }] });
    expect(send(withAgent("a2", { customCommand: { program: "evil.exe", args: [] } }))).toMatchObject({ error: "locked", field: "projects.agents.customCommand" });
    expect(send(withAgent("a1", { autoApprove: true }))).toMatchObject({ error: "locked", field: "projects.agents.autoApprove" });
    const fresh = { id: "a3", name: "Nuevo", provider: "claude", role: "implementer", parentId: "a1", autoApprove: true };
    expect(send({ projects: [{ id: "p1", agents: [...agents(), fresh] }] })).toMatchObject({ error: "locked", field: "projects.agents.autoApprove" });
    const custom = { ...fresh, autoApprove: false, provider: "custom", customCommand: { program: "calc.exe", args: [] } };
    expect(send({ projects: [{ id: "p1", agents: [...agents(), custom] }] })).toMatchObject({ error: "locked", field: "projects.agents.customCommand" });
    // Delegations wait for approval on this host: an agent cannot opt out, nor the host as a whole.
    expect(send(withAgent("a1", { requireApproval: false }))).toMatchObject({ error: "locked", field: "projects.agents.requireApproval" });
    expect(send({ config: { approveDelegations: false } })).toMatchObject({ error: "locked", field: "approveDelegations" });
    // A formation's agents follow the same rules.
    const formations = view().formations!.map(f => ({ ...f, agents: f.agents.map(a => ({ ...a, autoApprove: true })) }));
    expect(send({ config: { formations } })).toMatchObject({ error: "locked", field: "formations.agents.autoApprove" });

    // What only restricts goes through.
    expect(send(withAgent("a2", { autoApprove: false, name: "Renombrado", model: "x" }))).toMatchObject({ ok: true });
    expect(send(withAgent("a1", { requireApproval: true }))).toMatchObject({ ok: true });
    expect(send({ projects: [{ id: "p1", agents: [...agents(), { ...fresh, autoApprove: false }] }] })).toMatchObject({ ok: true });
    const relaxed = host();
    relaxed.approveDelegations = false;
    expect(send({ config: { approveDelegations: true } }, relaxed)).toMatchObject({ ok: true });
  });

  it("only tightens the planners' permissions", () => {
    const perms = host().plannerPermissions!;
    const sendPerms = (plannerPermissions: unknown) => send({ config: { plannerPermissions } });
    expect(sendPerms({ ...perms, presets: { ...perms.presets, install: true } })).toMatchObject({ error: "locked", field: "plannerPermissions.presets" });
    // `anything` is off by default: turning it on widens even when the host never wrote it.
    expect(sendPerms({ ...perms, presets: { ...perms.presets, anything: true } })).toMatchObject({ error: "locked", field: "plannerPermissions.presets" });
    expect(sendPerms({ ...perms, allow: ["docker ps", "rm *"] })).toMatchObject({ error: "locked", field: "plannerPermissions.allow" });
    expect(sendPerms({ ...perms, deny: [] })).toMatchObject({ error: "locked", field: "plannerPermissions.deny" });
    // Taking the setting away puts the defaults back: wider than this host's.
    expect(sendPerms(null)).toMatchObject({ error: "locked" });

    expect(sendPerms({ ...perms, presets: { ...perms.presets, git: false } })).toMatchObject({ ok: true });
    expect(sendPerms({ ...perms, allow: [] })).toMatchObject({ ok: true });
    expect(sendPerms({ ...perms, deny: ["git push", "npm publish"] })).toMatchObject({ ok: true });
  });

  it("does not change what a project runs, but relabels and deletes it", () => {
    const verify = [{ id: "v1", label: "test", program: "npm", args: ["run", "evil"] }];
    expect(send({ projects: [{ id: "p1", verify }] })).toMatchObject({ error: "locked", field: "projects.verify" });
    expect(send({ projects: [{ id: "p1", verify: [...host().projects[0].verify!, { id: "v2", label: "x", program: "calc.exe", args: [] }] }] })).toMatchObject({ error: "locked", field: "projects.verify" });
    expect(send({ projects: [{ id: "p1", commands: [{ id: "c1", label: "dev", command: "calc.exe" }] }] })).toMatchObject({ error: "locked", field: "projects.commands" });

    expect(send({ projects: [{ id: "p1", verify: [{ id: "v1", label: "tests", program: "npm", args: ["test"] }] }] })).toMatchObject({ ok: true });
    expect(send({ projects: [{ id: "p1", verify: [], commands: [] }] })).toMatchObject({ ok: true });
    expect(send({ projects: [{ id: "p1", verify: null }] })).toMatchObject({ ok: true });
  });

  it("does not open a project's room nor let another machine in, but closes it", () => {
    const room = () => view().projects[0].room!;
    expect(send({ projects: [{ id: "p1", room: { ...room(), enabled: true } }] })).toMatchObject({ error: "locked", field: "projects.room.enabled" });
    expect(send({ projects: [{ id: "p1", room: { ...room(), allowed: { mA: "Laptop", mB: "Intruso" } } }] })).toMatchObject({ error: "locked", field: "projects.room.allowed" });
    expect(send({ projects: [{ id: "p1", room: { ...room(), allowed: {} } }] })).toMatchObject({ ok: true });
    const open = host();
    open.projects[0].room!.enabled = true;
    expect(send({ projects: [{ id: "p1", room: { ...remoteConfigView(open).projects[0].room!, enabled: false } }] }, open)).toMatchObject({ ok: true });
  });
});

describe("the settings command", () => {
  beforeEach(() => { vi.resetModules(); });

  async function boot() {
    const removeSkillDir = vi.fn(async () => {});
    const removePluginDir = vi.fn(async () => {});
    const { setTransport } = await import("@/lib/transport");
    setTransport({
      ...nullTransport,
      loadConfig: async () => structuredClone(hostConfig()),
      saveConfig: async () => {},
      removeSkillDir,
      removePluginDir,
      homeDir: async () => "C:\\Users\\bruno",
    });
    const store = await import("@/store");
    await store.useAppStore.getState().init();
    const remote = await import("@/lib/remote");
    return { store, run: remote.handleRemoteCommand, removeSkillDir, removePluginDir };
  }

  it("answers the config masked, with a version and the host's home", async () => {
    const { run } = await boot();
    const answer = await run("settings", { op: "get" });
    expect(typeof answer.version).toBe("number");
    expect(answer.home).toBe("C:\\Users\\bruno");
    expect(JSON.stringify(answer)).not.toContain("ghp_env");
  });

  it("applies a checked patch through the store, and cleans up after what went", async () => {
    const { store, run, removeSkillDir, removePluginDir } = await boot();
    const before = await run("settings", { op: "get" }) as { version: number };
    const agents = [{ ...agent, name: "Planificador", model: "opus" }];
    const answer = await run("settings", {
      op: "update",
      patch: { config: { skills: [], plugins: [] }, projects: [{ id: "p1", agents, sharedContext: "notas" }] },
    });
    expect(answer).toMatchObject({ ok: true });
    expect(answer.version).not.toBe(before.version);

    const config = store.useAppStore.getState().config;
    expect(config.projects[0].agents).toEqual(agents);
    expect(config.projects[0].sharedContext).toBe("notas");
    expect(config.skills).toEqual([]);
    expect(removeSkillDir).toHaveBeenCalledWith("C:\\skills\\una");
    expect(removePluginDir).toHaveBeenCalledWith("C:\\plugins\\pl1");
  });

  it("refuses a bad patch without touching anything, and says why", async () => {
    const { store, run } = await boot();
    const before = store.useAppStore.getState().config;
    const answer = await run("settings", { op: "update", patch: { config: { remote: { token: "mine" } } } });
    expect(typeof answer.error).toBe("string");
    expect(store.useAppStore.getState().config).toBe(before);
  });

  it("deletes a project on the host", async () => {
    const { store, run } = await boot();
    expect(await run("settings", { op: "removeProject", projectId: "nope" })).toHaveProperty("error");
    expect(await run("settings", { op: "removeProject", projectId: "p1" })).toMatchObject({ ok: true });
    expect(store.useAppStore.getState().config.projects).toEqual([]);
  });
});
