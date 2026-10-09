/**
 * The literal-text guard (M3 plan, S11 and acceptance targets, layer 1):
 * finds interface text written in code instead of read from the
 * catalogue. It parses each file with the TypeScript compiler API and
 * reports
 *
 *   (a) JSX text with a letter,
 *   (b) a string-literal `aria-label`, `title`, `placeholder` or `alt`,
 *   (c) any other string literal or template text, in any position, that
 *       reads as language: a letter, a space and a letter, or a capital
 *       starting a word and followed by a lower-case letter ("Home"). A
 *       capital inside a word doesn't count, so camelCase codes such as
 *       `outOfRange` pass.
 *
 * Codes, keys, class names, routes and storage keys (`pt-PT`, `EUR`,
 * `/split`, `settle.bill`) pass (c). So does a lone lower-case word such
 * as `'less'`: the heuristic can't tell it from a code, which is why the
 * Portuguese rendering tests (layer 3) carry English sentinels too.
 *
 * Skipped: module specifiers, literal types, and developer-only text (the
 * arguments of any `new …Error(…)`, of `throw` and of `console.*`), which
 * never reach the interface.
 */
import ts from 'typescript'

export interface LiteralFinding {
  file: string
  line: number
  kind: 'jsx-text' | 'attribute' | 'literal'
  text: string
}

const LABEL_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt'])

/** Text that reads as language (rule c). */
export function readsAsLanguage(text: string): boolean {
  return /\p{L} +\p{L}/u.test(text) || /(?:^|[^\p{L}])\p{Lu}\p{Ll}/u.test(text)
}

function isDeveloperOnly(node: ts.Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isThrowStatement(current)) return true
    if (
      ts.isNewExpression(current) &&
      /Error$/.test(current.expression.getText())
    ) {
      return true
    }
    if (
      ts.isCallExpression(current) &&
      /^console\.\w+$/.test(current.expression.getText())
    ) {
      return true
    }
    if (ts.isSourceFile(current)) return false
  }
  return false
}

function isSkippedPosition(node: ts.Node): boolean {
  const parent = node.parent
  return (
    ts.isImportDeclaration(parent) ||
    ts.isExportDeclaration(parent) ||
    ts.isLiteralTypeNode(parent) ||
    ts.isImportTypeNode(parent.parent) ||
    // `import('…')` and `vi.mock('…')`-style specifiers.
    (ts.isCallExpression(parent) &&
      parent.expression.kind === ts.SyntaxKind.ImportKeyword)
  )
}

/**
 * A label attribute's literal text, written `aria-label="…"` or in braces
 * as `aria-label={'…'}` or a template with no substitution: rule (b)
 * holds for all three, so a lone lower-case word in braces doesn't slip
 * past rule (c) (R1-O2).
 */
function attributeLiteral(
  initializer: ts.JsxAttributeValue | undefined,
): string | undefined {
  if (initializer === undefined) return undefined
  if (ts.isStringLiteral(initializer)) return initializer.text
  const expression = ts.isJsxExpression(initializer)
    ? initializer.expression
    : undefined
  return expression !== undefined &&
    (ts.isStringLiteral(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression))
    ? expression.text
    : undefined
}

/**
 * The findings in one source text. `allowed` holds exact literal values
 * the caller accepts (each with a reason, kept at the call site).
 */
export function findLiteralText(
  file: string,
  source: string,
  allowed: ReadonlySet<string> = new Set(),
): LiteralFinding[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const findings: LiteralFinding[] = []
  const report = (
    node: ts.Node,
    kind: LiteralFinding['kind'],
    text: string,
  ) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
    findings.push({ file, line: line + 1, kind, text: text.trim() })
  }

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      if (/\p{L}/u.test(node.text) && !allowed.has(node.text.trim())) {
        report(node, 'jsx-text', node.text)
      }
    } else if (
      ts.isJsxAttribute(node) &&
      LABEL_ATTRIBUTES.has(node.name.getText()) &&
      attributeLiteral(node.initializer) !== undefined
    ) {
      const text = attributeLiteral(node.initializer) ?? ''
      if (!allowed.has(text)) report(node, 'attribute', text)
      return
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (
        readsAsLanguage(node.text) &&
        !allowed.has(node.text) &&
        !isSkippedPosition(node) &&
        !isDeveloperOnly(node)
      ) {
        report(node, 'literal', node.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return findings
}
