export type Catalog = Readonly<Record<string, string>>;
export type Translate = (key: string, ...args: (string | number)[]) => string;

/** Same `{0}` placeholder semantics as Ext.String.format, so legacy catalog entries are reused verbatim. */
export function createTranslator(catalog: Catalog, fallback?: Catalog): Translate {
  return (key, ...args) => {
    const template = catalog[key] ?? fallback?.[key] ?? key;
    if (!args.length) return template;
    return template.replace(/\{(\d+)\}/g, (match, index: string) => {
      const value = args[Number(index)];
      return value === undefined ? match : String(value);
    });
  };
}
