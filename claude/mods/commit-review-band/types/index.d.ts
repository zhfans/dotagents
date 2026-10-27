export type ReviewState = 'running' | 'pass' | 'block' | 'blind' | 'unreviewed'

export type Review = {
  repo: string
  subject: string
  state: ReviewState
  // The user's words the reviewer checked against, quoted in its Sources line.
  spec?: string
  diff?: string
  findings: string[]
  report?: string
  // Set once a git commit follows a passing review: the short hash, or '' when
  // the commit printed none (git commit -q).
  committed?: string
}

declare module 'claude-code' {
  interface PluginState {
    'commit-review-band': {
      rows: Record<string, Review>
      expanded: string | null
      briefs: Record<string, { repo: string; subject: string }>
    }
  }
}
