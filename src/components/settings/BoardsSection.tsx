// Where the credentials of the board platforms live.
//
// The token is here and not in the project dialog because it belongs to the account, not to the
// board: one person's GitHub token reads every project they can see, and asking for it again per
// project would mean the same secret copied into the config as many times as there are boards.
// What a project picks in its own dialog is the platform and the board on it — the `owner/number`
// — and this is what it authenticates with.
import { useState } from "react";
import { useAppStore } from "@/store";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useT } from "@/i18n/useT";

export function BoardsSection() {
  const t = useT();
  const config = useAppStore(state => state.config);
  const updateConfig = useAppStore(state => state.updateConfig);

  const saved = config.boards?.github?.token ?? "";
  const [token, setToken] = useState(saved);

  const save = (value: string) => {
    updateConfig({ boards: { ...config.boards, github: { token: value } } });
  };

  return (
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
            onBlur={() => token.trim() !== saved && save(token.trim())}
          />
          <span className="text-sm text-muted-foreground">{t("boards.github.tokenHint")}</span>
        </div>
        <p className="text-sm text-muted-foreground">{t("boards.hint")}</p>
      </CardContent>
    </Card>
  );
}
