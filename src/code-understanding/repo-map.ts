import path from 'node:path'
import type { FileSystem } from '../core/fs.js'
import { isSupportedExtension, parseFileSymbols } from './parser.js'
import type { FileSymbols } from './types.js'

export class RepoMapper {
    async generateMap(filePaths: string[], fs: FileSystem): Promise<string> {
        const allSymbols: FileSymbols[] = []

        const supportedPaths = filePaths.filter((p) => isSupportedExtension(path.extname(p)))

        for (const filePath of supportedPaths) {
            try {
                const source = await fs.readText(filePath)
                const symbols = await parseFileSymbols(filePath, source)
                if (symbols && symbols.symbols.length > 0) {
                    allSymbols.push(symbols)
                }
            } catch {
                // Skip files that can't be read
            }
        }

        return formatRepoMap(allSymbols)
    }
}

function formatRepoMap(files: FileSymbols[]): string {
    if (files.length === 0) return '(no symbols found)'

    const lines: string[] = []

    for (const file of files) {
        lines.push(file.filePath)

        for (const sym of file.symbols) {
            const prefix = sym.kind === 'method' ? '  ' : ''
            const kindLabel = sym.kind
            const sig = sym.signature ? ` ${sym.signature}` : ''
            lines.push(`│${prefix} ${kindLabel} ${sym.name}${sig}`)
        }

        lines.push('')
    }

    return lines.join('\n').trimEnd()
}
