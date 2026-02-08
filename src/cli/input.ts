import { emitKeypressEvents, type Key } from 'node:readline'
import { getSlashCommands } from './slash-commands.js'

const MAX_VISIBLE = 15
let keypressReady = false

/**
 * Custom input prompt with inline slash command suggestions.
 * When the user types `/`, shows the command list in real time,
 * filtering as they type. Arrows navigate, Tab completes, Enter submits.
 *
 * Uses readline.emitKeypressEvents to correctly parse escape sequences (arrows, etc.),
 * even when the runtime delivers bytes in separate chunks.
 */
export async function promptInput(placeholder = 'Ask anything...'): Promise<string | null> {
    // Fallback for non-TTY (pipe, CI)
    if (!process.stdin.isTTY) {
        const { createInterface } = await import('node:readline')
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        return new Promise((resolve) => {
            rl.question('> ', (answer) => {
                rl.close()
                resolve(answer || null)
            })
        })
    }

    // emitKeypressEvents is internally idempotent
    if (!keypressReady) {
        emitKeypressEvents(process.stdin)
        keypressReady = true
    }

    return new Promise((resolve) => {
        const { stdin, stdout } = process

        let buffer = ''
        let cursor = 0
        let selected = -1

        const commands = getSlashCommands()

        stdin.setRawMode(true)
        stdin.resume()

        function getSuggestions() {
            if (!buffer.startsWith('/') || buffer.includes(' ')) return []
            const prefix = buffer.toLowerCase()
            if (prefix === '/') return commands
            return commands.filter((c) => c.name.toLowerCase().startsWith(prefix))
        }

        function render() {
            stdout.write('\r\x1b[J')

            if (buffer.length > 0) {
                stdout.write(`\x1b[1m>\x1b[0m ${buffer}`)
            } else {
                stdout.write(`\x1b[1m>\x1b[0m \x1b[2m${placeholder}\x1b[0m`)
            }

            const suggestions = getSuggestions()
            const visible = suggestions.slice(0, MAX_VISIBLE)

            if (visible.length > 0) {
                for (let i = 0; i < visible.length; i++) {
                    const cmd = visible[i]!
                    const name = cmd.name.padEnd(18)
                    stdout.write('\n')
                    if (i === selected) {
                        stdout.write(`  \x1b[36m${name}\x1b[0m${cmd.description}`)
                    } else {
                        stdout.write(`  \x1b[2m${name}${cmd.description}\x1b[0m`)
                    }
                }
                stdout.write(`\x1b[${visible.length}A`)
            }

            stdout.write(`\r\x1b[${2 + cursor}C`)
        }

        function done(value: string | null) {
            stdout.write('\r\x1b[J')
            stdin.removeListener('keypress', onKeypress)
            stdin.setRawMode(false)
            stdin.pause()

            if (value) {
                stdout.write(`\x1b[1m>\x1b[0m ${value}\n`)
            } else {
                stdout.write('\n')
            }

            resolve(value)
        }

        function onKeypress(str: string | undefined, key: Key) {
            if (!key) return

            // Ctrl+C
            if (key.ctrl && key.name === 'c') {
                done(null)
                return
            }

            // Escape
            if (key.name === 'escape') {
                if (buffer.length > 0) {
                    buffer = ''
                    cursor = 0
                    selected = -1
                    render()
                } else {
                    done(null)
                }
                return
            }

            // Enter
            if (key.name === 'return') {
                const suggestions = getSuggestions()
                if (selected >= 0 && selected < suggestions.length) {
                    buffer = suggestions[selected]!.name
                    cursor = buffer.length
                }
                done(buffer || null)
                return
            }

            // Tab — autocomplete
            if (key.name === 'tab') {
                const suggestions = getSuggestions()
                if (suggestions.length > 0) {
                    const idx = selected < 0 ? 0 : selected
                    buffer = `${suggestions[idx]!.name} `
                    cursor = buffer.length
                    selected = -1
                }
                render()
                return
            }

            // Arrow Up
            if (key.name === 'up') {
                const suggestions = getSuggestions()
                if (suggestions.length > 0) {
                    const max = Math.min(suggestions.length, MAX_VISIBLE)
                    selected = selected <= 0 ? max - 1 : selected - 1
                    render()
                }
                return
            }

            // Arrow Down
            if (key.name === 'down') {
                const suggestions = getSuggestions()
                if (suggestions.length > 0) {
                    const max = Math.min(suggestions.length, MAX_VISIBLE)
                    selected = selected >= max - 1 ? 0 : selected + 1
                    render()
                }
                return
            }

            // Arrow Left
            if (key.name === 'left') {
                if (cursor > 0) {
                    cursor--
                    render()
                }
                return
            }

            // Arrow Right
            if (key.name === 'right') {
                if (cursor < buffer.length) {
                    cursor++
                    render()
                }
                return
            }

            // Home / Ctrl+A
            if (key.name === 'home' || (key.ctrl && key.name === 'a')) {
                cursor = 0
                render()
                return
            }

            // End / Ctrl+E
            if (key.name === 'end' || (key.ctrl && key.name === 'e')) {
                cursor = buffer.length
                render()
                return
            }

            // Backspace
            if (key.name === 'backspace') {
                if (cursor > 0) {
                    buffer = buffer.slice(0, cursor - 1) + buffer.slice(cursor)
                    cursor--
                    selected = -1
                    render()
                }
                return
            }

            // Delete
            if (key.name === 'delete') {
                if (cursor < buffer.length) {
                    buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1)
                    selected = -1
                    render()
                }
                return
            }

            // Ctrl+U: clear line
            if (key.ctrl && key.name === 'u') {
                buffer = ''
                cursor = 0
                selected = -1
                render()
                return
            }

            // Ctrl+W: delete previous word
            if (key.ctrl && key.name === 'w') {
                if (cursor > 0) {
                    const before = buffer.slice(0, cursor)
                    const trimmed = before.replace(/\S+\s*$/, '')
                    buffer = trimmed + buffer.slice(cursor)
                    cursor = trimmed.length
                    selected = -1
                    render()
                }
                return
            }

            // Printable character
            if (str && !key.ctrl && !key.meta) {
                buffer = buffer.slice(0, cursor) + str + buffer.slice(cursor)
                cursor += str.length
                selected = -1
                render()
            }
        }

        render()
        stdin.on('keypress', onKeypress)
    })
}
