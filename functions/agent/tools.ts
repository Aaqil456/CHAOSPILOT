import { z } from 'zod'
import { maxReadCharacters, projectFilePaths } from './projectFiles.ts'
import type { AgentTool } from './runtime.ts'

const projectPath = z.enum(projectFilePaths)

export const agentTools: AgentTool[] = [
  {
    name: 'list_files',
    description: 'List files currently present in the request-scoped website project.',
    inputSchema: z.object({}).strict(),
    async execute(_input, context) {
      return { files: context.workspace.listFiles() }
    },
  },
  {
    name: 'read_file',
    description: `Read up to ${maxReadCharacters} characters from one existing file. Use offset to read successive chunks when you need its complete content.`,
    inputSchema: z.object({
      path: projectPath,
      offset: z.number().int().min(0).max(64 * 1024).optional(),
      max_characters: z.number().int().min(1).max(maxReadCharacters).optional(),
    }).strict(),
    async execute(input, context) {
      const parsed = z.object({
        path: projectPath,
        offset: z.number().int().min(0).max(64 * 1024).optional(),
        max_characters: z.number().int().min(1).max(maxReadCharacters).optional(),
      }).strict().parse(input)
      return context.workspace.readFile(parsed.path, parsed.offset, parsed.max_characters)
    },
  },
  {
    name: 'write_file',
    description: 'Create one new allowlisted project file. Existing files are immutable in this first milestone. Use only index.html, styles.css, or script.js.',
    inputSchema: z.object({
      path: projectPath,
      content: z.string().max(64 * 1024),
    }).strict(),
    async execute(input, context) {
      const parsed = z.object({
        path: projectPath,
        content: z.string().max(64 * 1024),
      }).strict().parse(input)
      return context.workspace.writeFile(parsed.path, parsed.content)
    },
  },
]
