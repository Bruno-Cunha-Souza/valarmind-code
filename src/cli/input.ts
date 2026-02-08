import { emitKeypressEvents, type Key } from 'node:readline'
import { getSlashCommands } from './slash-commands.js'

const MAX_VISIBLE = 15
let keypressReady = false

/**
 * Custom input prompt with inline slash command suggestions and multi-line support.
 *
 * Slash commands: type `/` to see suggestions, arrows navigate, Tab completes.
 * Multi-line: Shift+Enter or Alt+Enter inserts a newline. Enter submits.
 *
 * Note: Shift+Enter requires terminal support for modifier detection.
 * Alt+Enter works reliably in most terminals (Alacritty, iTerm2, Terminal.app, Kitty).
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

    if (!keypressReady) {
        emitKeypressEvents(process.stdin)
        keypressReady = true
    }

    return new Promise((resolve) => {
        const { stdin, stdout } = process

        let buffer = ''
        let cursor = 0
        let selected = -1
        let lastCursorRow = 0

        const commands = getSlashCommands()

        stdin.setRawMode(true)
        stdin.resume()

        /** Convert flat cursor position to {row, col} within buffer lines. */
        function cursorToRowCol(pos: number): { row: number; col: number } {
            const before = buffer.slice(0, pos)
            const rows = before.split('\n')
            return { row: rows.length - 1, col: rows[rows.length - 1]!.length }
        }

        /** Convert {row, col} back to flat cursor position. */
        function flatPos(row: number, col: number): number {
            const lines = buffer.split('\n')
            let pos = 0
            for (let i = 0; i < row && i < lines.length; i++) {
                pos += lines[i]!.length + 1
            }
            pos += Math.min(col, (lines[row] ?? '').length)
            return pos
        }

        function getSuggestions() {
            if (!buffer.startsWith('/') || buffer.includes(' ') || buffer.includes('\n')) return []
            const prefix = buffer.toLowerCase()
            if (prefix === '/') return commands
            return commands.filter((c) => c.name.toLowerCase().startsWith(prefix))
        }

        function render() {
            const lines = buffer.split('\n')

            // Move back to first line of our render area
            if (lastCursorRow > 0) {
                stdout.write(`\x1b[${lastCursorRow}A`)
            }
            stdout.write('\r\x1b[J')

            // Draw each line
            for (let i = 0; i < lines.length; i++) {
                const prefix = i === 0 ? '\x1b[1m>\x1b[0m ' : '  '
                if (i === 0 && buffer.length === 0) {
                    stdout.write(`${prefix}\x1b[2m${placeholder}\x1b[0m`)
                } else {
                    stdout.write(`${prefix}${lines[i]}`)
                }
                if (i < lines.length - 1) stdout.write('\n')
            }

            // Suggestions (only single-line slash commands)
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

            // Position cursor at correct row/col
            const { row, col } = cursorToRowCol(cursor)
            const lastLine = lines.length - 1
            if (lastLine > row) {
                stdout.write(`\x1b[${lastLine - row}A`)
            }
            stdout.write(`\r\x1b[${2 + col}C`)

            lastCursorRow = row
        }

        function done(value: string | null) {
            // Clear render area
            if (lastCursorRow > 0) {
                stdout.write(`\x1b[${lastCursorRow}A`)
            }
            stdout.write('\r\x1b[J')

            stdin.removeListener('keypress', onKeypress)
            stdin.setRawMode(false)
            stdin.pause()

            if (value) {
                const lines = value.split('\n')
                for (let i = 0; i < lines.length; i++) {
                    const prefix = i === 0 ? '\x1b[1m>\x1b[0m ' : '  '
                    stdout.write(`${prefix}${lines[i]}\n`)
                }
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
                // Shift+Enter or Alt+Enter: insert newline
                if (key.shift || key.meta) {
                    buffer = buffer.slice(0, cursor) + '\n' + buffer.slice(cursor)
                    cursor++
                    selected = -1
                    render()
                    return
                }
                // Regular Enter: submit
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
                const lines = buffer.split('\n')
                if (lines.length > 1) {
                    // Multi-line: move cursor to previous line
                    const { row, col } = cursorToRowCol(cursor)
                    if (row > 0) {
                        cursor = flatPos(row - 1, col)
                        render()
                    }
                    return
                }
                // Single-line: navigate suggestions
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
                const lines = buffer.split('\n')
                if (lines.length > 1) {
                    // Multi-line: move cursor to next line
                    const { row, col } = cursorToRowCol(cursor)
                    if (row < lines.length - 1) {
                        cursor = flatPos(row + 1, col)
                        render()
                    }
                    return
                }
                // Single-line: navigate suggestions
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

            // Home / Ctrl+A — start of current line
            if (key.name === 'home' || (key.ctrl && key.name === 'a')) {
                const { row } = cursorToRowCol(cursor)
                cursor = flatPos(row, 0)
                render()
                return
            }

            // End / Ctrl+E — end of current line
            if (key.name === 'end' || (key.ctrl && key.name === 'e')) {
                const { row } = cursorToRowCol(cursor)
                const lines = buffer.split('\n')
                cursor = flatPos(row, lines[row]!.length)
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

            // Ctrl+U: clear entire buffer
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
