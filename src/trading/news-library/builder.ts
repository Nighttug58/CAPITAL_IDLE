import type { NewsTemplate, NewsCategory } from '../news.ts'
import type { AssetKind } from '../types.ts'

interface StoryOptions {
  prefix: string
  category: NewsCategory
  kind: AssetKind | 'all'
  target: NewsTemplate['target']
  direction: 1 | -1
  priceWeight: number
  dividendWeight: number
  rumored?: boolean
}
export function buildStories(options: StoryOptions, raw: string): NewsTemplate[] {
  return raw.trim().split('\n').filter(Boolean).map((line, index) => {
    const [headline, description, scenario, direction, kind, target] = line.split('|').map(x => x.trim())
    if (!headline || !description || !scenario) throw new Error('News éditoriale incomplète : ' + options.prefix + ' #' + (index+1))
    return {
      id: 'lib-' + options.prefix + '-' + String(index + 1).padStart(2, '0'),
      headline,
      description,
      scenario,
      category: options.category,
      kind: (kind || options.kind) as NewsTemplate['kind'],
      target: (target || options.target) as NewsTemplate['target'],
      direction: direction === '-' ? -1 : direction === '+' ? 1 : options.direction,
      priceWeight: options.priceWeight,
      dividendWeight: options.dividendWeight,
      rumored: options.rumored ?? false,
    }
  })
}
