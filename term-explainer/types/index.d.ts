export type Term = { term: string; plain: string; seenAt: number }

declare module 'claude-code' {
  interface PluginState {
    'term-explainer': { recent: Term[]; isHidden: boolean }
  }
}
