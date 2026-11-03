/**
 * The Inbox page: every question the running agents are waiting on, newest
 * first, each row opening the Session that asked it. A Session answers its own
 * question in its conversation, so the page navigates rather than answering.
 */

import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { waitingRows, type InboxRow } from './inbox-rows.ts'
import type { InboxLocaleKey } from './locales.ts'
import css from './InboxPage.module.css'

/** Registration-side dependencies of {@link InboxPage}. */
export interface InboxInjected {
  /** Show one Session's conversation as a navigation action. */
  openSession: (sessionId: SessionId) => void
}

/** Full component props assembled by the main slot renderer. */
export type InboxPageProps = PropsRuntime<'main'> & PropsLocale<'hitlInbox'> & InjectFace<InboxInjected>

/** One waiting row with the Session title resolved for display. */
interface DisplayRow extends InboxRow {
  readonly title: string
}

function Row({ row, t, onOpen }: {
  row: DisplayRow
  t: (key: InboxLocaleKey) => string
  onOpen: () => void
}): ReactNode {
  return (
    <button type="button" className={css.row} onClick={onOpen}>
      <span className={css.dot} aria-hidden="true" />
      <span className={css.rowBody}>
        <span className={css.rowTitle}>{row.headline ?? row.title}</span>
        <span className={css.rowMeta}>
          {row.headline === undefined
            ? t(row.kindLabel)
            : `${t(row.kindLabel)} · ${row.title}`}
        </span>
      </span>
      {row.count > 1 && (
        <span className={css.rowCount}>
          {t('moreQuestions').replace('{count}', String(row.count))}
        </span>
      )}
    </button>
  )
}

/**
 * Render the waiting questions across every Session the browser knows.
 * @param props - the main panel's standing seats, the inbox copy, and navigation.
 * @returns the page element.
 */
export function InboxPage({ useSessions, useSessionStatus, openSession, t }: InboxPageProps): ReactNode {
  const statuses = useSessionStatus(snapshot => snapshot)
  const list = useSessions(snapshot => snapshot)
  const rows: readonly DisplayRow[] = waitingRows(statuses).map(row => ({
    ...row,
    title: list.byId[row.sessionId]?.displayTitle ?? t('unnamedSession'),
  }))

  return (
    <div className={css.page}>
      <div className={css.head}>
        <h1 className={css.title}>{t('title')}</h1>
        <p className={css.intro}>{t('intro')}</p>
      </div>
      <div className={css.body}>
        {rows.length === 0
          ? <p className={css.empty}>{t('emptyPending')}</p>
          : rows.map(row => (
            <Row
              key={`${row.sessionId}:${row.key}`}
              row={row}
              t={t}
              onOpen={() => { openSession(row.sessionId) }}
            />
          ))}
      </div>
    </div>
  )
}
