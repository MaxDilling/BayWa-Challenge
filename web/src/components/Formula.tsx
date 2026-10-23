import katex from 'katex'
import { useMemo } from 'react'

/**
 * LaTeX as MathML: rendered by the browser, so no KaTeX fonts or CSS have to ship in windgap.html.
 * KaTeX writes the hat of \hat{v} as an ASCII caret, which browser math fonts draw tall; U+02C6 sits right.
 */
export function Formula({ tex }: { tex: string }) {
  const html = useMemo(
    () => katex.renderToString(tex, { output: 'mathml', displayMode: true, throwOnError: false }).replaceAll('<mo>^</mo>', '<mo>ˆ</mo>'),
    [tex],
  )
  return <div className="text-stat text-foreground" dangerouslySetInnerHTML={{ __html: html }} />
}
