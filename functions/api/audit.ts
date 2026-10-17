import { handleAudit, type PagesContext } from '../agent/auditHandler.ts'

export const onRequestPost = (context: PagesContext): Promise<Response> => handleAudit(context)
