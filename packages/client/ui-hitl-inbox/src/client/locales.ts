/** Expert inbox copy. */

import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Expert inbox copy. */
    hitlInbox: InboxLocaleKey
  }
}

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  panel: '收件箱',
  title: '收件箱',
  intro: '正在运行的 Agent 向你提出的问题',
  tabPending: '待回答',
  tabAnswered: '已回答',
  emptyPending: '系统暂时没有问题要问你',
  emptyAnswered: '还没有已回答的问题',
  unnamedSession: '未命名',
  openSession: '去回答',
  question: '提问',
  planReview: '方案确认',
  approval: '待批准',
  moreQuestions: '等 {count} 个问题',
} as const

/** Dictionary key set owned by this plugin. */
export type InboxLocaleKey = keyof typeof zh

/** English dictionary. */
export const en: Record<InboxLocaleKey, string> = {
  panel: 'Inbox',
  title: 'Inbox',
  intro: 'Questions the running agents are waiting on',
  tabPending: 'Waiting',
  tabAnswered: 'Answered',
  emptyPending: 'No agent is waiting on you right now',
  emptyAnswered: 'No answered questions yet',
  unnamedSession: 'Untitled',
  openSession: 'Answer',
  question: 'Question',
  planReview: 'Plan review',
  approval: 'Approval',
  moreQuestions: '{count} questions',
}

/** Japanese dictionary. */
export const ja: Record<InboxLocaleKey, string> = {
  panel: '受信箱',
  title: '受信箱',
  intro: '実行中のエージェントが待っている質問',
  tabPending: '未回答',
  tabAnswered: '回答済み',
  emptyPending: '現在、待機中の質問はありません',
  emptyAnswered: '回答済みの質問はまだありません',
  unnamedSession: '無題',
  openSession: '回答する',
  question: '質問',
  planReview: 'プラン確認',
  approval: '承認待ち',
  moreQuestions: '{count} 件の質問',
}

/** German dictionary. */
export const de: Record<InboxLocaleKey, string> = {
  panel: 'Posteingang',
  title: 'Posteingang',
  intro: 'Fragen, auf die laufende Agenten warten',
  tabPending: 'Offen',
  tabAnswered: 'Beantwortet',
  emptyPending: 'Derzeit wartet kein Agent auf dich',
  emptyAnswered: 'Noch keine beantworteten Fragen',
  unnamedSession: 'Ohne Titel',
  openSession: 'Antworten',
  question: 'Frage',
  planReview: 'Planprüfung',
  approval: 'Freigabe',
  moreQuestions: '{count} Fragen',
}

/** French dictionary. */
export const fr: Record<InboxLocaleKey, string> = {
  panel: 'Boîte de réception',
  title: 'Boîte de réception',
  intro: 'Questions en attente des agents en cours',
  tabPending: 'En attente',
  tabAnswered: 'Répondu',
  emptyPending: 'Aucun agent ne vous attend pour le moment',
  emptyAnswered: 'Aucune question répondue',
  unnamedSession: 'Sans titre',
  openSession: 'Répondre',
  question: 'Question',
  planReview: 'Revue du plan',
  approval: 'Approbation',
  moreQuestions: '{count} questions',
}

/** Spanish dictionary. */
export const es: Record<InboxLocaleKey, string> = {
  panel: 'Bandeja de entrada',
  title: 'Bandeja de entrada',
  intro: 'Preguntas que esperan los agentes en ejecución',
  tabPending: 'Pendientes',
  tabAnswered: 'Respondidas',
  emptyPending: 'Ningún agente te está esperando ahora',
  emptyAnswered: 'Aún no hay preguntas respondidas',
  unnamedSession: 'Sin título',
  openSession: 'Responder',
  question: 'Pregunta',
  planReview: 'Revisión del plan',
  approval: 'Aprobación',
  moreQuestions: '{count} preguntas',
}

/** Portuguese dictionary. */
export const pt: Record<InboxLocaleKey, string> = {
  panel: 'Caixa de entrada',
  title: 'Caixa de entrada',
  intro: 'Perguntas que os agentes em execução aguardam',
  tabPending: 'Pendentes',
  tabAnswered: 'Respondidas',
  emptyPending: 'Nenhum agente está esperando por você agora',
  emptyAnswered: 'Ainda não há perguntas respondidas',
  unnamedSession: 'Sem título',
  openSession: 'Responder',
  question: 'Pergunta',
  planReview: 'Revisão do plano',
  approval: 'Aprovação',
  moreQuestions: '{count} perguntas',
}

/** Russian dictionary. */
export const ru: Record<InboxLocaleKey, string> = {
  panel: 'Входящие',
  title: 'Входящие',
  intro: 'Вопросы, которых ждут работающие агенты',
  tabPending: 'Ожидают',
  tabAnswered: 'Отвечено',
  emptyPending: 'Сейчас ни один агент вас не ждёт',
  emptyAnswered: 'Отвеченных вопросов пока нет',
  unnamedSession: 'Без названия',
  openSession: 'Ответить',
  question: 'Вопрос',
  planReview: 'Проверка плана',
  approval: 'Подтверждение',
  moreQuestions: '{count} вопросов',
}
