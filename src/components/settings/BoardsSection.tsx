// Where the credentials of the board platforms live.
//
// The token is here and not in the project dialog because it belongs to the account, not to the
// board: one person's GitHub token reads every project they can see, and asking for it again per
// project would mean the same secret copied into the config as many times as there are boards.
// What a project picks in its own dialog is the platform and the board on it — the `owner/number`,
// the Trello board URL — and this is what it authenticates with.
import { useState } from "react";
import { useAppStore } from "@/store";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useT } from "@/i18n/useT";

export function BoardsSection() {
  const t = useT();
  const config = useAppStore(state => state.config);
  const updateConfig = useAppStore(state => state.updateConfig);

  const savedGithub = config.boards?.github?.token ?? "";
  const savedKey = config.boards?.trello?.key ?? "";
  const savedToken = config.boards?.trello?.token ?? "";
  const [token, setToken] = useState(savedGithub);
  const [trelloKey, setTrelloKey] = useState(savedKey);
  const [trelloToken, setTrelloToken] = useState(savedToken);

  const saveGithub = (value: string) => {
    updateConfig({ boards: { ...config.boards, github: { token: value } } });
  };

  // Both halves travel together, and the one that is not being edited is read from the config and
  // not from the other field's state: `mergeConfig` merges `boards` key by key, so writing only
  // `{ key }` here would leave the token behind on disk and the two would drift apart.
  const saveTrello = (changes: { key?: string; token?: string }) => {
    updateConfig({
      boards: {
        ...config.boards,
        trello: { key: savedKey, token: savedToken, ...changes },
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          {/* The block, not the section: the dialog's own header already shows the section name and
              its help right above this card, and repeating them here said the same thing twice. */}
          <CardTitle>{t("boards.github.title")}</CardTitle>
          <CardDescription>{t("boards.github.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold">{t("boards.github.token")}</label>
            <Input
              type="password"
              value={token}
              placeholder="github_pat_…"
              onChange={e => setToken(e.target.value)}
              onBlur={() => token.trim() !== savedGithub && saveGithub(token.trim())}
            />
            <span className="text-sm text-muted-foreground">{t("boards.github.tokenHint")}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("boards.trello.title")}</CardTitle>
          <CardDescription>{t("boards.trello.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Two fields and not one: Trello authenticates the app with the key and the person with
              the token, and neither one alone opens a board. */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold">{t("boards.trello.key")}</label>
            <Input
              type="password"
              value={trelloKey}
              onChange={e => setTrelloKey(e.target.value)}
              onBlur={() => trelloKey.trim() !== savedKey && saveTrello({ key: trelloKey.trim() })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-semibold">{t("boards.trello.token")}</label>
            <Input
              type="password"
              value={trelloToken}
              onChange={e => setTrelloToken(e.target.value)}
              onBlur={() => trelloToken.trim() !== savedToken && saveTrello({ token: trelloToken.trim() })}
            />
          </div>
          <span className="text-sm text-muted-foreground">{t("boards.trello.hint")}</span>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">{t("boards.hint")}</p>
    </div>
  );
}
