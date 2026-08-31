const UPPERCASE_TOKENS = new Set(["a/l", "a/p", "s/o", "d/o"]);

function titleCaseSegment(segment: string): string {
  if (!segment) return segment;
  return segment.charAt(0).toLocaleUpperCase("en-SG") + segment.slice(1).toLocaleLowerCase("en-SG");
}

function titleCaseToken(token: string): string {
  const lower = token.toLocaleLowerCase("en-SG");
  if (UPPERCASE_TOKENS.has(lower)) return lower.toLocaleUpperCase("en-SG");

  return lower
    .split("-")
    .map((hyphenPart) => hyphenPart.split("'").map(titleCaseSegment).join("'"))
    .join("-");
}

export function titleCaseName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(titleCaseToken)
    .join(" ");
}

export function firstName(value: string): string {
  const cleaned = titleCaseName(value);
  return cleaned.split(" ")[0] || cleaned;
}
