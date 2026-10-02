// Fill {key} placeholders in a library template. Throws on a missing key so a
// template and its caller can't drift apart silently. Extra vars are ignored.

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (_match, key: string) => {
    if (!(key in vars)) {
      throw new Error(`fill: no value for {${key}} in "${template}"`);
    }
    return vars[key];
  });
}
