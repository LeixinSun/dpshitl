import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { waitingRows, type WaitingInteraction, type WaitingStatus } from '../src/client/inbox-rows.ts'

const sessionId = (value: string): SessionId => value as SessionId

function status(pendingInteraction: WaitingInteraction | undefined): WaitingStatus {
  return { pendingInteraction }
}

function snapshot(entries: readonly (readonly [string, WaitingStatus])[]): ReadonlyMap<SessionId, WaitingStatus> {
  return new Map(entries.map(([id, value]) => [sessionId(id), value]))
}

describe('waitingRows', () => {
  it('lists one row per waiting Session and leaves the settled ones out', () => {
    const rows = waitingRows(snapshot([
      ['s1', status({ key: 'k1', kind: 'question' })],
      ['s2', status(undefined)],
      ['s3', status({ key: 'k3', kind: 'approval' })],
    ]))
    expect(rows.map(row => row.sessionId)).toEqual([sessionId('s1'), sessionId('s3')])
    expect(rows.map(row => row.kindLabel)).toEqual(['question', 'approval'])
  })

  it('reads the headline and count off a carrier that names its questions', () => {
    const rows = waitingRows(snapshot([
      ['s1', status({
        key: 'k1',
        kind: 'question',
        questions: [{ question: 'Which shape wins?' }, { question: 'And the fallback?' }],
      })],
    ]))
    expect(rows[0]?.headline).toBe('Which shape wins?')
    expect(rows[0]?.count).toBe(2)
  })

  it('falls back to the header when a question carries no prompt text', () => {
    const rows = waitingRows(snapshot([
      ['s1', status({ key: 'k1', kind: 'question', questions: [{ header: 'Tiling' }] })],
    ]))
    expect(rows[0]?.headline).toBe('Tiling')
  })

  it('lists a kind it does not name, without a headline, rather than dropping it', () => {
    const rows = waitingRows(snapshot([
      ['s1', status({ key: 'k1', kind: 'some-future-domain' })],
    ]))
    expect(rows).toEqual([{
      sessionId: sessionId('s1'),
      key: 'k1',
      kindLabel: 'question',
      headline: undefined,
      count: 1,
    }])
  })

  it('names the plan-review kind with its own copy key', () => {
    const rows = waitingRows(snapshot([
      ['s1', status({ key: 'k1', kind: 'plan-review' })],
    ]))
    expect(rows[0]?.kindLabel).toBe('planReview')
  })

  it('treats an empty question list as one unnamed request', () => {
    const rows = waitingRows(snapshot([
      ['s1', status({ key: 'k1', kind: 'question', questions: [] })],
    ]))
    expect(rows[0]).toMatchObject({ headline: undefined, count: 1 })
  })
})
