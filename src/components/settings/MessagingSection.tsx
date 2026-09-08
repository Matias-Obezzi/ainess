// Driving the app from a chat you already have open.
//
// Nothing is exposed by turning this on: the app is the one that goes out and asks its bot for
// messages, so there is no port, no tunnel and no address for anyone to find. What there is instead
// is a list of chats that may give orders, and that list is the whole of the security — which is
// why the screen is mostly about filling it correctly, and says out loud what it means.
import { useEffect, useState } from "react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { bridgeRunning, lastUnknownChatId, sendTest } from "@/lib/bridge";
import { openExternal } from "@/lib/open-external";
import { ExternalLink, Plus, Send, TriangleAlert, X } from "lucide-react";
import { useT } from "@/i18n/useT";

const BOTFATHER_URL = "https://t.me/botfather";
const LAST_PROJECT = "__last__";

export function MessagingSection() {
  const t = useT();
  const config = useAppStore(state => state.config);
  const updateConfig = useAppStore(state => state.updateConfig);
  const toggleBridge = useAppStore(state => state.toggleBridge);
  const restartBridge = useAppStore(state => state.restartBridge);

  const telegram = config.messaging?.telegram;
  const enabled = telegram?.enabled === true;

  const [token, setToken] = useState(telegram?.token ?? "");
  const [newChat, setNewChat] = useState("");
  const [testing, setTesting] = useState(false);
  // Neither of these lives in the store: one is a module's memory of who wrote, the other is what
  // the poll loop is doing. A slow tick is enough for both and costs nothing while the panel is shut.
  const [unknown, setUnknown] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const tick = () => {
      setUnknown(lastUnknownChatId());
      setRunning(bridgeRunning());
    };
    tick();
    const timer = window.setInterval(tick, 2000);
    return () => window.clearInterval(timer);
  }, []);

  const chats = telegram?.allowedChatIds ?? [];

  const save = (patch: Partial<NonNullable<typeof telegram>>) => {
    const messaging = config.messaging ?? {};
    updateConfig({
      messaging: {
        ...messaging,
        telegram: { enabled: false, token: "", allowedChatIds: [], projectId: null, ...telegram, ...patch },
      },
    });
    // A token or a list that changed mid-flight is only real once the poll loop reads it again.
    if (enabled) void restartBridge();
  };

  const addChat = (id: string) => {
    const clean = id.trim();
    if (!clean || chats.includes(clean)) return;
    save({ allowedChatIds: [...chats, clean] });
    setNewChat("");
  };

  const test = async () => {
    const target = chats[0];
    if (!target) return;
    setTesting(true);
    try {
      await sendTest(target);
      toast.success(t("messaging.testSent"));
    } catch (e) {
      toast.error(t("messaging.testFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("messaging.title")}</CardTitle>
          <CardDescription>{t("messaging.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={checked => void toggleBridge(checked)} />
            <div className="flex flex-col">
              <label className="text-sm font-semibold">{t("messaging.enable")}</label>
              <span className="text-sm text-muted-foreground">{t("messaging.enableHint")}</span>
            </div>
            {enabled && (
              <Badge variant="outline" className="ml-auto text-[10px]">
                {running ? t("messaging.connected") : t("messaging.disconnected")}
              </Badge>
            )}
          </div>

          <div className="flex flex-col gap-1 border-t pt-3">
            <label className="text-sm font-semibold">{t("messaging.token")}</label>
            <Input
              type="password"
              value={token}
              placeholder="123456:ABC-DEF…"
              onChange={e => setToken(e.target.value)}
              onBlur={() => token !== (telegram?.token ?? "") && save({ token: token.trim() })}
            />
            <span className="text-sm text-muted-foreground">{t("messaging.tokenHint")}</span>
            <Button
              variant="ghost"
              size="sm"
              className="self-start px-0 text-xs"
              onClick={() => void openExternal(BOTFATHER_URL)}
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> @BotFather
            </Button>
          </div>

          <div className="flex flex-col gap-2 border-t pt-3">
            <label className="text-sm font-semibold">{t("messaging.chats")}</label>
            <span className="text-sm text-muted-foreground">{t("messaging.chatsHint")}</span>

            {chats.map(id => (
              <div key={id} className="flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{id}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={t("common.delete")}
                  onClick={() => save({ allowedChatIds: chats.filter(c => c !== id) })}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            {/* Nobody knows their own chat id: write to the bot once and it turns up here. */}
            {unknown && !chats.includes(unknown) && (
              <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
                <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="flex-1 text-xs">{t("messaging.unknownChat", { id: unknown })}</span>
                <Button size="sm" className="h-7 text-xs" onClick={() => addChat(unknown)}>
                  {t("messaging.authorize")}
                </Button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Input
                className="h-8 w-[200px] text-xs"
                placeholder={t("messaging.addChat")}
                value={newChat}
                onChange={e => setNewChat(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addChat(newChat)}
              />
              <Button variant="ghost" size="sm" className="h-8" onClick={() => addChat(newChat)} disabled={!newChat.trim()}>
                <Plus className="mr-1 h-3.5 w-3.5" /> {t("messaging.addChat")}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1 border-t pt-3">
            <label className="text-sm font-semibold">{t("messaging.project")}</label>
            <Select
              value={telegram?.projectId ?? LAST_PROJECT}
              onValueChange={value => save({ projectId: value === LAST_PROJECT ? null : value })}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={LAST_PROJECT}>{t("messaging.projectLast")}</SelectItem>
                {config.projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 border-t pt-3">
            <Button size="sm" disabled={chats.length === 0 || !token.trim() || testing} onClick={() => void test()}>
              <Send className="mr-1 h-3.5 w-3.5" /> {t("messaging.test")}
            </Button>
            <span className="text-xs text-muted-foreground">{t("messaging.warning")}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
