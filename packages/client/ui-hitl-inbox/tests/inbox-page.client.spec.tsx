// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  SessionPendingInteraction, SessionStatus, SessionStatusSnapshot,
} from '@deepseek-ai/dsh-client-ui-session/client'
import { InboxPage, type InboxPageProps } from '../src/client/InboxPage.tsx'
import { en, type InboxLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

const sessionId = (value: string): SessionId => value as SessionId

const t = (key: InboxLocaleKey): string => en[key]

function waiting(id: string, questions?: readonly { question: string }[]): readonly [SessionId, SessionStatus] {
  const interaction = {
    key: `${id}-request`, kind: 'question', sessionId: sessionId(id), ...(questions === undefined ? {} : { questions }),
  } as SessionPendingInteraction
  return [sessionId(id), { running: true, pendingInteraction: interaction, completionUnread: false }]
}

function mount(
  statuses: readonly (readonly [SessionId, SessionStatus])[],
  titles: Readonly<Record<string, string>> = {},
  openSession = vi.fn<(id: SessionId) => void>(),
) {
  const snapshot: SessionStatusSnapshot = new Map(statuses)
  const list = {
    byId: Object.fromEntries(Object.entries(titles).map(([id, displayTitle]) => [id, { displayTitle }])),
  }
  const props = {
    useSessionStatus: (select: (value: SessionStatusSnapshot) => unknown) => select(snapshot),
    useSessions: (select: (value: unknown) => unknown) => select(list),
    openSession,
    t,
  } as unknown as InboxPageProps
  return { view: render(<InboxPage {...props} />), openSession }
}

describe('InboxPage', () => {
  it('states that nothing is waiting when no agent asked', () => {
    mount([])
    expect(screen.getByText(en.emptyPending)).toBeTruthy()
  })

  it('leads each row with the question and names the Session behind it', () => {
    mount([waiting('s1', [{ question: 'Which tiling wins?' }])], { s1: 'nms optimization' })
    expect(screen.getByText('Which tiling wins?')).toBeTruthy()
    expect(screen.getByText(`${en.question} · nms optimization`)).toBeTruthy()
  })

  it('falls back to the Session title, and its kind alone, when the carrier names no question', () => {
    mount([waiting('s1')], { s1: 'nms optimization' })
    expect(screen.getByText('nms optimization')).toBeTruthy()
    expect(screen.getByText(en.question)).toBeTruthy()
  })

  it('labels a Session the list has no row for', () => {
    mount([waiting('s1')])
    expect(screen.getByText(en.unnamedSession)).toBeTruthy()
  })

  it('counts a batched request', () => {
    mount([waiting('s1', [{ question: 'A?' }, { question: 'B?' }])], { s1: 'batch' })
    expect(screen.getByText('2 questions')).toBeTruthy()
  })

  it('opens the Session that asked', () => {
    const { openSession } = mount([waiting('s1', [{ question: 'Which tiling wins?' }])], { s1: 'nms' })
    fireEvent.click(screen.getByText('Which tiling wins?'))
    expect(openSession).toHaveBeenCalledExactlyOnceWith(sessionId('s1'))
  })
})
