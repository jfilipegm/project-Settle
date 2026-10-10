/**
 * The literal-text guard (M3 plan, S11 and acceptance targets, layer 1):
 * finds interface text written in code instead of read from the
 * catalogue. It parses each file with the TypeScript compiler API and
 * reports
 *
 *   (a) JSX text with a letter,
 *   (b) literal text in an `aria-label`, `title`, `placeholder`, `alt` or
 *       `label` attribute (`label` being the kit components' prop): a
 *       string or a template, also inside a ternary, `||`, `??`, `&&`,
 *       parentheses, `as` or `satisfies` (M5, B1, hardening M3's R2-O1),
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

const LABEL_ATTRIBUTES = new Set([
  'aria-label',
  'title',
  'placeholder',
  'alt',
  'label',
])

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
 * The literal text a label attribute's value can show: `aria-label="…"`,
 * or in braces a string or a template (each literal part of one with
 * substitutions), reached through a ternary's branches, `||`, `??`, the
 * right of `&&`, parentheses, `as`, `satisfies` or a type assertion. Rule
 * (b) holds for all of them, so a lone lower-case word doesn't slip past
 * rule (c) (R1-O2, R2-O1). A call (`t('…')`) is never looked into.
 */
type LabelLiteral =
  | ts.StringLiteral
  | ts.NoSubstitutionTemplateLiteral
  | ts.TemplateHead
  | ts.TemplateMiddle
  | ts.TemplateTail

function labelLiterals(expression: ts.Expression): LabelLiteral[] {
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return [expression]
  }
  if (ts.isTemplateExpression(expression)) {
    return [
      expression.head,
      ...expression.templateSpans.map((span) => span.literal),
    ]
  }
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    return labelLiterals(expression.expression)
  }
  if (ts.isConditionalExpression(expression)) {
    return [
      ...labelLiterals(expression.whenTrue),
      ...labelLiterals(expression.whenFalse),
    ]
  }
  if (ts.isBinaryExpression(expression)) {
    const operator = expression.operatorToken.kind
    if (
      operator === ts.SyntaxKind.BarBarToken ||
      operator === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return [
        ...labelLiterals(expression.left),
        ...labelLiterals(expression.right),
      ]
    }
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
      return labelLiterals(expression.right)
    }
  }
  return []
}

function attributeLiterals(
  initializer: ts.JsxAttributeValue | undefined,
): LabelLiteral[] {
  let literals: LabelLiteral[] = []
  if (initializer !== undefined && ts.isStringLiteral(initializer)) {
    literals = [initializer]
  } else if (
    initializer !== undefined &&
    ts.isJsxExpression(initializer) &&
    initializer.expression !== undefined
  ) {
    literals = labelLiterals(initializer.expression)
  }
  // Only text with a letter reads as language ('', '0' and '…' don't).
  return literals.filter((literal) => /\p{L}/u.test(literal.text))
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
  // A label attribute's literals, reported once under rule (b).
  const labelled = new Set<ts.Node>()
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
      LABEL_ATTRIBUTES.has(node.name.getText())
    ) {
      for (const literal of attributeLiterals(node.initializer)) {
        labelled.add(literal)
        if (!allowed.has(literal.text.trim())) {
          report(literal, 'attribute', literal.text)
        }
      }
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (
        !labelled.has(node) &&
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
