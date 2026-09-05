export function renderTemplate(tpl: string, vars: Record<string, any>): string {
  if (!tpl) return "";
  return tpl.replace(/\{\{([^}]+)\}\}/g, (_match, keyInfo) => {
    const parts = keyInfo.split("|");
    const key = parts[0].trim();
    let val = vars[key];
    if (val === undefined || val === null) {
      val = "";
    } else if (typeof val === "object") {
      val = JSON.stringify(val);
    } else {
      val = String(val);
    }
    if (parts.length > 1) {
      const len = parseInt(parts[1].trim(), 10);
      if (!isNaN(len) && val.length > len) {
        val = val.substring(0, len) + "…";
      }
    }
    return val;
  });
}
