// Themes: a preset to start from, every colour the components read to change by hand, and the
// theme as CSS to copy out or paste in. See `lib/themes.ts` for what a theme is.
import { useMemo, useState } from "react";
import { useAppStore } from "@/store";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/i18n/useT";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/components/ui/toast";
import {
  CUSTOM_PRESET, DEFAULT_PRESET, DEFAULT_THEME, THEME_PRESETS, THEME_VARS,
  parseThemeCss, themeFromPreset, themeToCss, withVar, type ThemeVar,
} from "@/lib/themes";

/** What the stylesheet gives a variable right now: the placeholder of a colour left alone. */
function currentValue(name: ThemeVar): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

const HEX = /^#[0-9a-f]{6}$/i;

export function AppearanceSection() {
  const t = useT();
  const theme = useAppStore(state => state.config.theme ?? DEFAULT_THEME);
  const mascotAlways = useAppStore(state => state.config.mascotAlways ?? false);
  const screenAnimations = useAppStore(state => state.config.screenAnimations ?? true);
  const updateConfig = useAppStore(state => state.updateConfig);
  const [pasted, setPasted] = useState("");

  const setTheme = (next: typeof theme) => updateConfig({ theme: next });
  const presetLabel = (p: (typeof THEME_PRESETS)[number]) => p.label ?? t(p.labelKey ?? "");
  const vars = theme.vars as Record<string, string>;
  // Read once per render, after the theme was applied: the values a theme did not set.
  const defaults = useMemo(() => Object.fromEntries(THEME_VARS.map(name => [name, currentValue(name)])), [theme]);

  const importCss = () => {
    const found = parseThemeCss(pasted);
    if (Object.keys(found).length === 0) {
      toast.error(t("appearance.nothingToImport"));
      return;
    }
    setTheme({ preset: CUSTOM_PRESET, vars: { ...vars, ...found } });
    setPasted("");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("appearance.presetTitle")}</CardTitle>
          <CardDescription>{t("appearance.presetHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Select value={theme.preset} onValueChange={id => setTheme(id === DEFAULT_PRESET ? DEFAULT_THEME : themeFromPreset(id))}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_PRESET}>{t("appearance.presetDefault")}</SelectItem>
              {THEME_PRESETS.map(p => <SelectItem key={p.id} value={p.id}>{presetLabel(p)}</SelectItem>)}
              {theme.preset === CUSTOM_PRESET && <SelectItem value={CUSTOM_PRESET}>{t("appearance.presetCustom")}</SelectItem>}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setTheme(DEFAULT_THEME)} disabled={theme.preset === DEFAULT_PRESET}>
            {t("settings.option.appearance.reset")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("appearance.colorsTitle")}</CardTitle>
          <CardDescription>{t("appearance.colorsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {THEME_VARS.map(name => {
            const value = vars[name] ?? "";
            const shown = value || defaults[name];
            return (
              <div key={name} className="flex items-center gap-2">
                {/* The swatch is the value itself, whatever notation it is in: the browser reads it. */}
                <span className="h-7 w-7 shrink-0 rounded-md border border-border" style={{ background: shown }} aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label className="text-xs font-medium">{t(`appearance.var.${name}`)}</label>
                  <div className="flex items-center gap-1">
                    <Input
                      value={value}
                      placeholder={defaults[name]}
                      spellCheck={false}
                      className="h-8 font-mono text-xs"
                      onChange={e => setTheme(withVar(theme, name, e.target.value))}
                    />
                    {/* The native picker only speaks hex; it writes hex, and reads it when it can. */}
                    <Input
                      type="color"
                      value={HEX.test(shown) ? shown : "#000000"}
                      className="h-8 w-10 shrink-0 p-1"
                      aria-label={t(`appearance.var.${name}`)}
                      onChange={e => setTheme(withVar(theme, name, e.target.value))}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-2">
          <Switch checked={mascotAlways} onCheckedChange={checked => updateConfig({ mascotAlways: checked })} />
          <div className="flex flex-col">
            <label className="text-sm font-semibold">{t("settings.option.appearance.mascotAlways")}</label>
            <span className="text-sm text-muted-foreground">{t("appearance.mascotAlwaysHint")}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-2">
          {/* On unless it was turned off: the app animates as shipped, and a config written before
              this setting existed says nothing about it. */}
          <Switch
            checked={screenAnimations}
            onCheckedChange={checked => updateConfig({ screenAnimations: checked })}
          />
          <div className="flex flex-col">
            <label className="text-sm font-semibold">{t("settings.option.appearance.screenAnimations")}</label>
            <span className="text-sm text-muted-foreground">{t("appearance.screenAnimationsHint")}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("appearance.cssTitle")}</CardTitle>
          <CardDescription>{t("appearance.cssHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Textarea
            value={pasted}
            onChange={e => setPasted(e.target.value)}
            placeholder={t("appearance.pastePlaceholder")}
            spellCheck={false}
            className="min-h-[96px] font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={importCss} disabled={!pasted.trim()}>{t("settings.option.appearance.pasteCss")}</Button>
            <Button
              variant="outline"
              size="sm"
              disabled={Object.keys(vars).length === 0}
              onClick={() => void copyText(themeToCss(vars), t("appearance.copied"))}
            >
              {t("settings.option.appearance.copyCss")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
