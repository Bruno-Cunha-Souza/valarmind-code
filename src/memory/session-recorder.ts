import path from 'node:path'
import type { FileSystem } from '../core/fs.js'
import type { SessionEntry } from './types.js'

export class SessionRecorder {
    private sessionPath: string
    private buffer: string[] = []

    constructor(
        private fs: FileSystem,
        sessionsDir: string
    ) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        this.sessionPath = path.join(sessionsDir, `${timestamp}.jsonl`)
    }

    async record(entry: SessionEntry): Promise<void> {
        const line = JSON.stringify(entry)
        this.buffer.push(line)

        // Flush every 10 entries
        if (this.buffer.length >= 10) {
            await this.flush()
        }
    }

    async flush(): Promise<void> {
        if (this.buffer.length === 0) return

        const dir = path.dirname(this.sessionPath)
        await this.fs.mkdir(dir)

        let existing = ''
        try {
            if (await this.fs.exists(this.sessionPath)) {
                existing = await this.fs.readText(this.sessionPath)
            }
        } catch {
            // new file
        }

        const content = existing + this.buffer.join('\n') + '\n'
        await this.fs.writeText(this.sessionPath, content)
        this.buffer = []
    }

    getPath(): string {
        return this.sessionPath
    }
}
