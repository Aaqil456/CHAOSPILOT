import { z } from 'zod'

export const projectFilePaths = ['index.html', 'styles.css', 'script.js'] as const
export type ProjectFilePath = typeof projectFilePaths[number]
export type ProjectFiles = Partial<Record<ProjectFilePath, string>>

export const maxProjectFileBytes = 64 * 1024
export const maxProjectTotalBytes = 160 * 1024
export const maxProjectOperations = 12
export const maxReadCharacters = 16_000

export const projectFilesSchema = z.record(z.string(), z.string()).superRefine((files, context) => {
  const paths = Object.keys(files)
  if (paths.length > projectFilePaths.length) {
    context.addIssue({ code: 'custom', message: 'A project may contain no more than three files.' })
  }
  let totalBytes = 0
  for (const path of paths) {
    if (!projectFilePaths.includes(path as ProjectFilePath)) {
      context.addIssue({ code: 'custom', message: `Project path "${path}" is not allowed.` })
      continue
    }
    const bytes = new TextEncoder().encode(files[path] ?? '').byteLength
    totalBytes += bytes
    if (bytes > maxProjectFileBytes) {
      context.addIssue({ code: 'custom', message: `Project file "${path}" exceeds the 64 KB limit.` })
    }
  }
  if (totalBytes > maxProjectTotalBytes) {
    context.addIssue({ code: 'custom', message: 'The project exceeds the 160 KB total size limit.' })
  }
})

function assertProjectPath(path: string): asserts path is ProjectFilePath {
  if (!projectFilePaths.includes(path as ProjectFilePath) || path.includes('\\') || path.includes('..')) {
    throw new Error('File path is outside the project allowlist.')
  }
}

function validateFileContent(content: string): void {
  if (new TextEncoder().encode(content).byteLength > maxProjectFileBytes) {
    throw new Error('Project file exceeds the 64 KB limit.')
  }
}

export function validateProjectFiles(value: unknown): ProjectFiles {
  const parsed = projectFilesSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Project files are invalid.')
  }
  return { ...parsed.data } as ProjectFiles
}

export class ProjectWorkspace {
  private readonly files: ProjectFiles
  private operationCount = 0

  constructor(initialFiles: unknown) {
    this.files = validateProjectFiles(initialFiles)
  }

  snapshot(): ProjectFiles {
    return { ...this.files }
  }

  listFiles(): Array<{ path: ProjectFilePath; sizeBytes: number }> {
    this.recordOperation()
    return projectFilePaths
      .filter((path) => this.files[path] !== undefined)
      .map((path) => ({
        path,
        sizeBytes: new TextEncoder().encode(this.files[path] ?? '').byteLength,
      }))
  }

  readFile(path: string, offset = 0, maxCharacters = maxReadCharacters): {
    path: ProjectFilePath
    content: string
    totalCharacters: number
    nextOffset: number | null
  } {
    this.recordOperation()
    assertProjectPath(path)
    const content = this.files[path]
    if (content === undefined) throw new Error('Project file does not exist.')
    if (!Number.isInteger(offset) || offset < 0 || offset > content.length) {
      throw new Error('File read offset is outside the file.')
    }
    if (!Number.isInteger(maxCharacters) || maxCharacters < 1 || maxCharacters > maxReadCharacters) {
      throw new Error(`File reads are limited to ${maxReadCharacters} characters per operation.`)
    }
    const nextOffset = Math.min(offset + maxCharacters, content.length)
    return {
      path,
      content: content.slice(offset, nextOffset),
      totalCharacters: content.length,
      nextOffset: nextOffset < content.length ? nextOffset : null,
    }
  }

  writeFile(path: string, content: string): { path: ProjectFilePath; sizeBytes: number } {
    this.recordOperation()
    assertProjectPath(path)
    validateFileContent(content)
    if (this.files[path] !== undefined) {
      throw new Error('Overwriting existing files is not enabled in this milestone.')
    }
    if (Object.keys(this.files).length >= projectFilePaths.length) {
      throw new Error('Project file count limit reached.')
    }
    this.assertTotalSize(content)
    this.files[path] = content
    return { path, sizeBytes: new TextEncoder().encode(content).byteLength }
  }

  private recordOperation(): void {
    if (this.operationCount >= maxProjectOperations) throw new Error('Project operation limit reached.')
    this.operationCount += 1
  }

  private assertTotalSize(content: string): void {
    const totalBytes = Object.values(this.files).reduce((total, currentContent) => {
      return total + new TextEncoder().encode(currentContent ?? '').byteLength
    }, new TextEncoder().encode(content).byteLength)
    if (totalBytes > maxProjectTotalBytes) throw new Error('The project exceeds the 160 KB total size limit.')
  }
}
