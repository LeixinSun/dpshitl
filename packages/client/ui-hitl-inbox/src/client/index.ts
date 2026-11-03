/**
 * Expert inbox, browser half: the **Inbox** entry of the sidebar and the page
 * it opens in the main column. The page lists every question the running
 * agents are waiting on and opens the Session that asked one; answering stays
 * in that Session's conversation, where the asking domain owns its composer.
 *
 * The list is derived from the Session status snapshot, so a question enters
 * and leaves the inbox with the pending interaction its own domain publishes.
 * Export discipline: packages/client/AGENTS.md.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the root `main` keyed slot the page registers into, declared by
// ui-layout with the panel id brand, and the `sidebar.panellist` list the
// entry registers into, declared by ui-sidebar.
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.uiWorkspace Context merge the row's navigation uses.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { InboxPage, type InboxInjected } from './InboxPage.tsx'
import { InboxPanelIcon } from './InboxPanelIcon.tsx'
import { en, ja, es, fr, de, ru, pt, zh, type InboxLocaleKey } from './locales.ts'

export type { InboxPageProps, InboxInjected } from './InboxPage.tsx'
export type { InboxRow } from './inbox-rows.ts'
export type { InboxLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Expert inbox copy. */
    hitlInbox: InboxLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'hitlInbox'

/** The id shared by the sidebar entry and the main panel it opens. */
const PANEL_ID = 'hitl-inbox' as MainPanelId

/** Required services: the slot registry, copy, panel navigation, and Session navigation. */
export const inject = ['slots', 'locale', 'layout', 'uiWorkspace']

/**
 * Contribute the Inbox entry to the sidebar with the page it opens.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-hitl-inbox: dictionaries')
  const t = ctx.locale.bind(NS)
  const face = (): InboxInjected => ({
    openSession: (sessionId) => { ctx.uiWorkspace.openSession(sessionId) },
  })
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: face,
  }, InboxPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 10,
    label: () => t('panel'),
    locale: NS,
  }, InboxPanelIcon))
}
