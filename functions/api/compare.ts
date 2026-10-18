import type { PagesContext } from '../agent/auditHandler.ts'
import { handleCompare } from '../agent/compareHandler.ts'

export const onRequestPost = (context: PagesContext): Promise<Response> => handleCompare(context)
