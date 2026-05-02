/**
 * Detectare prompturi „complexe” → rutare către model de reasoning (ex. deepseek-r1:8b).
 * Păstrează pragul de lungime în caller; aici doar pattern-uri regex + heuristici.
 */

const COMPLEX_PHRASE_RE =
  /\b(explic(?:ă|a)|analiz(?:ează|a)|compar(?:ă|a)|demonstr(?:ează|a)|raționament|argument(?:ație)?|pas cu pas|în detaliu|demonstrează|justifică|deduce|inferență|ipoteză|contradicție|sintetizează|evalu(?:ează|a)|critica|trade-?off|edge case|worst case)\b/i;

const COMPLEX_EN_RE =
  /\b(analyze|reasoning|step by step|prove that|elaborate|why does|how does .{0,40} work|compare and contrast|trade-?off|edge case)\b/i;

const CODE_OR_DATA_RE =
  /```|function\s*\(|class\s+\w+|import\s+[\w{}*]+\s+from|SELECT\s+.+\s+FROM|\{\s*"[\w_]+"\s*:|<\/?[a-z][\w:-]*\s/i;

const MATH_OR_LOGIC_RE =
  /(demonstrație|teoremă|QED|∀|∃|=>|⇒|≤|≥|∑|∫|\\frac\b|\$\$|\\\(|\\\[)/i;

const LEGAL_FINANCE_RE =
  /\b(lege|juridic|notar|contract|litigiu|fiscal|TVA|ANAF|GDPR|despăgubir|garanție legală)\b/i;

/** Întrebări multiple sau cereri de enumerare mare. */
const ENUM_OR_MULTI_RE =
  /\b(enumera|listează toate|fiecare dintre|toate cele|cel puțin \d+|minimum \d+ (?:points|steps|reasons))\b/i;

export function isComplexCombinedPrompt(combinedText: string, totalChars: number): boolean {
  const t = combinedText;
  if (!t.trim()) return false;

  if (t.includes("```")) return true;
  if (CODE_OR_DATA_RE.test(t)) return true;

  const qCount = (t.match(/\?/g) ?? []).length;
  if (qCount >= 3) return true;

  if (COMPLEX_PHRASE_RE.test(t) || COMPLEX_EN_RE.test(t)) return true;
  if (MATH_OR_LOGIC_RE.test(t)) return true;
  if (LEGAL_FINANCE_RE.test(t)) return true;
  if (ENUM_OR_MULTI_RE.test(t)) return true;

  if (totalChars >= 1200 && /[{}\[\];]/.test(t) && /[a-z]{2,}\.[a-z]{2,}/i.test(t)) return true;

  return false;
}
