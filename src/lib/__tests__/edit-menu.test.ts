import { describe, it, expect } from "vitest";
import { editMenuItems, type EditMenuKey } from "../edit-menu";

/** The items that are usable, by key, which is what the menu actually shows as clickable. */
function enabled(items: { key: EditMenuKey; enabled: boolean }[]): EditMenuKey[] {
  return items.filter(i => i.enabled).map(i => i.key);
}

describe("editMenuItems", () => {
  it("en un campo vacío y sin selección solo deja pegar", () => {
    const items = editMenuItems({ hasSelection: false, hasContent: false });
    expect(items.map(i => i.key)).toEqual(["cut", "copy", "paste", "selectAll"]);
    expect(enabled(items)).toEqual(["paste"]);
  });

  it("con contenido pero sin selección agrega seleccionar todo", () => {
    expect(enabled(editMenuItems({ hasSelection: false, hasContent: true }))).toEqual(["paste", "selectAll"]);
  });

  it("con algo seleccionado habilita cortar y copiar", () => {
    expect(enabled(editMenuItems({ hasSelection: true, hasContent: true }))).toEqual(["cut", "copy", "paste", "selectAll"]);
  });

  it("un campo de solo lectura copia pero no corta ni pega", () => {
    expect(enabled(editMenuItems({ hasSelection: true, hasContent: true, readOnly: true }))).toEqual(["copy", "selectAll"]);
  });

  it("la terminal solo ofrece copiar y pegar, y copiar pide selección", () => {
    const empty = editMenuItems({ terminal: true, hasSelection: false, hasContent: true });
    expect(empty.map(i => i.key)).toEqual(["copy", "paste"]);
    expect(enabled(empty)).toEqual(["paste"]);
    expect(enabled(editMenuItems({ terminal: true, hasSelection: true, hasContent: true }))).toEqual(["copy", "paste"]);
  });
});
