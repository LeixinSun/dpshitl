/** Inbox row derivation: the questions the running agents are waiting on. */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionPendingInteraction, SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { InboxLocaleKey } from './locales.ts'

/** One waiting question as the inbox list presents it. */
export interface InboxRow {
  /** Session whose conversation can answer it; also the row's React key. */
  readonly sessionId: SessionId
  /** Request identity, so a replacement request is a different row. */
  readonly key: string
  /** Copy key naming what kind of answer is wanted. */
  readonly kindLabel: InboxLocaleKey
  /** The first question's headline, or absence when the carrier names none. */
  readonly headline: string | undefined
  /** How many questions the request carries; 1 unless the asker batched them. */
  readonly count: number
}

/** Pending-interaction carriers that name their questions; other kinds list without a headline. */
interface QuestionCarrier {
  readonly questions?: readonly { readonly header?: string; readonly question?: string }[]
}

/**
 * Read the headline and question count off a pending interaction.
 *
 * The carrier is owned by whichever domain raised the request, so a kind this
 * package does not know still lists — with its session and its kind — rather
 * than being dropped.
 * @param interaction - the session's highest-precedence pending request.
 * @returns the headline (absent when the carrier names none) and the question count.
 */
function describe(interaction: SessionPendingInteraction): { headline: string | undefined; count: number } {
  const questions = (interaction as SessionPendingInteraction & QuestionCarrier).questions
  if (questions === undefined || questions.length === 0) return { headline: undefined, count: 1 }
  const first = questions[0]
  return { headline: first?.question ?? first?.header, count: questions.length }
}

/** Copy keys for the pending-interaction kinds this package names. */
const KIND_LABEL: Readonly<Record<string, InboxLocaleKey>> = {
  question: 'question',
  'plan-review': 'planReview',
  approval: 'approval',
}

/**
 * Derive the waiting rows from the Session status snapshot.
 *
 * A Session holds at most one highest-precedence pending request, so the list
 * is one row per waiting Session, newest Session order left to the caller.
 * @param statuses - current UI status indexed by Session identity.
 * @returns one row per Session awaiting an answer.
 */
export function waitingRows(statuses: SessionStatusSnapshot): readonly InboxRow[] {
  const rows: InboxRow[] = []
  for (const [sessionId, status] of statuses) {
    const interaction = status.pendingInteraction
    if (interaction === undefined) continue
    const { headline, count } = describe(interaction)
    rows.push({
      sessionId,
      key: interaction.key,
      kindLabel: KIND_LABEL[interaction.kind] ?? 'question',
      headline,
      count,
    })
  }
  return rows
}
