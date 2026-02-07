import path from 'node:path'
import Parser from 'web-tree-sitter'
import type { FileSymbols, RepoSymbol } from './types.js'

let initialized = false
const languages = new Map<string, Parser.Language>()

const GRAMMAR_FILES: Record<string, string> = {
    // JavaScript / TypeScript
    '.ts': 'tree-sitter-typescript.wasm',
    '.tsx': 'tree-sitter-tsx.wasm',
    '.js': 'tree-sitter-javascript.wasm',
    '.jsx': 'tree-sitter-javascript.wasm',
    '.mjs': 'tree-sitter-javascript.wasm',
    '.cjs': 'tree-sitter-javascript.wasm',
    // Python
    '.py': 'tree-sitter-python.wasm',
    '.pyi': 'tree-sitter-python.wasm',
    // Rust
    '.rs': 'tree-sitter-rust.wasm',
    // Go
    '.go': 'tree-sitter-go.wasm',
    // Java
    '.java': 'tree-sitter-java.wasm',
    // C / C++
    '.c': 'tree-sitter-c.wasm',
    '.h': 'tree-sitter-c.wasm',
    '.cpp': 'tree-sitter-cpp.wasm',
    '.cc': 'tree-sitter-cpp.wasm',
    '.cxx': 'tree-sitter-cpp.wasm',
    '.hpp': 'tree-sitter-cpp.wasm',
    // C#
    '.cs': 'tree-sitter-c_sharp.wasm',
    // Ruby
    '.rb': 'tree-sitter-ruby.wasm',
    // PHP
    '.php': 'tree-sitter-php.wasm',
    // Swift
    '.swift': 'tree-sitter-swift.wasm',
    // Kotlin
    '.kt': 'tree-sitter-kotlin.wasm',
    '.kts': 'tree-sitter-kotlin.wasm',
    // Scala
    '.scala': 'tree-sitter-scala.wasm',
    // Elixir
    '.ex': 'tree-sitter-elixir.wasm',
    '.exs': 'tree-sitter-elixir.wasm',
    // Dart
    '.dart': 'tree-sitter-dart.wasm',
    // Lua
    '.lua': 'tree-sitter-lua.wasm',
    // Zig
    '.zig': 'tree-sitter-zig.wasm',
    // OCaml
    '.ml': 'tree-sitter-ocaml.wasm',
    '.mli': 'tree-sitter-ocaml.wasm',
    // Elm
    '.elm': 'tree-sitter-elm.wasm',
    // Solidity
    '.sol': 'tree-sitter-solidity.wasm',
    // Shell
    '.sh': 'tree-sitter-bash.wasm',
    '.bash': 'tree-sitter-bash.wasm',
    // Vue
    '.vue': 'tree-sitter-vue.wasm',
    // CSS
    '.css': 'tree-sitter-css.wasm',
    // HTML
    '.html': 'tree-sitter-html.wasm',
    '.htm': 'tree-sitter-html.wasm',
    // Config
    '.json': 'tree-sitter-json.wasm',
    '.yaml': 'tree-sitter-yaml.wasm',
    '.yml': 'tree-sitter-yaml.wasm',
    '.toml': 'tree-sitter-toml.wasm',
}

const SUPPORTED_EXTENSIONS = new Set(Object.keys(GRAMMAR_FILES))

async function ensureInitialized(): Promise<void> {
    if (initialized) return
    await Parser.init()
    initialized = true
}

async function getLanguage(ext: string): Promise<Parser.Language | null> {
    const cached = languages.get(ext)
    if (cached) return cached

    const wasmFile = GRAMMAR_FILES[ext]
    if (!wasmFile) return null

    const wasmPath = path.join(path.dirname(require.resolve('tree-sitter-wasms/package.json')), 'out', wasmFile)

    const lang = await Parser.Language.load(wasmPath)
    languages.set(ext, lang)
    return lang
}

export function isSupportedExtension(ext: string): boolean {
    return SUPPORTED_EXTENSIONS.has(ext)
}

export async function parseFileSymbols(filePath: string, source: string): Promise<FileSymbols | null> {
    const ext = path.extname(filePath)
    if (!isSupportedExtension(ext)) return null

    await ensureInitialized()

    const language = await getLanguage(ext)
    if (!language) return null

    const parser = new Parser()
    parser.setLanguage(language)

    const tree = parser.parse(source)
    const symbols = extractSymbols(tree.rootNode, source)

    parser.delete()
    tree.delete()

    return { filePath, language: ext.slice(1), symbols }
}

// Node types that represent function/method declarations across languages
const FUNCTION_NODE_TYPES = new Set([
    'function_declaration', // JS/TS, C, C++
    'function_definition', // Python, C, C++, Rust, PHP
    'method_declaration', // Java, C#, Go, Kotlin
    'function_item', // Rust
])

// Node types that represent class declarations
const CLASS_NODE_TYPES = new Set([
    'class_declaration', // JS/TS, Java, C#, Kotlin, Dart, PHP
    'class_definition', // Python, Ruby
    'struct_item', // Rust
    'struct_declaration', // C
    'struct_specifier', // C, C++
    'impl_item', // Rust
    'enum_item', // Rust
    'enum_declaration', // Java, C#, TS
])

// Node types that represent interface/trait/protocol declarations
const INTERFACE_NODE_TYPES = new Set([
    'interface_declaration', // TS, Java, C#, Kotlin, Go, Dart
    'trait_item', // Rust
    'protocol_declaration', // Swift
    'abstract_class_declaration', // Kotlin
])

// Node types that represent type alias/typedef
const TYPE_NODE_TYPES = new Set([
    'type_alias_declaration', // TS
    'type_item', // Rust
    'type_declaration', // Go
    'type_definition', // C/C++ typedef
])

function processNode(node: Parser.SyntaxNode, symbols: RepoSymbol[], source: string): void {
    const type = node.type

    // Functions / methods
    if (FUNCTION_NODE_TYPES.has(type)) {
        const nameNode = node.childForFieldName('name')
        if (nameNode) {
            symbols.push({
                name: nameNode.text,
                kind: 'function',
                line: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
                signature: extractSignature(node, source),
            })
        }
        return
    }

    // Classes / structs / enums
    if (CLASS_NODE_TYPES.has(type)) {
        const nameNode = node.childForFieldName('name')
        if (nameNode) {
            symbols.push({
                name: nameNode.text,
                kind: 'class',
                line: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
            })
            extractClassMembers(node, symbols, source)
        }
        return
    }

    // Interfaces / traits / protocols
    if (INTERFACE_NODE_TYPES.has(type)) {
        const nameNode = node.childForFieldName('name')
        if (nameNode) {
            symbols.push({
                name: nameNode.text,
                kind: 'interface',
                line: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
            })
        }
        return
    }

    // Type aliases
    if (TYPE_NODE_TYPES.has(type)) {
        const nameNode = node.childForFieldName('name')
        if (nameNode) {
            symbols.push({
                name: nameNode.text,
                kind: 'type',
                line: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
            })
        }
        return
    }

    // Language-specific handling
    switch (type) {
        // JS/TS variable declarations
        case 'lexical_declaration':
        case 'variable_declaration': {
            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i)
                if (child?.type === 'variable_declarator') {
                    const nameNode = child.childForFieldName('name')
                    if (nameNode) {
                        symbols.push({
                            name: nameNode.text,
                            kind: 'variable',
                            line: node.startPosition.row + 1,
                            endLine: node.endPosition.row + 1,
                        })
                    }
                }
            }
            break
        }

        // JS/TS exports
        case 'export_statement': {
            const decl = node.childForFieldName('declaration')
            if (decl) {
                processNode(decl, symbols, source)
            }
            break
        }

        // Python: decorated functions/classes (@decorator\ndef ...)
        case 'decorated_definition': {
            const definition = node.childForFieldName('definition')
            if (definition) {
                processNode(definition, symbols, source)
            }
            break
        }

        // Go: top-level var/const blocks
        case 'var_declaration':
        case 'const_declaration': {
            for (let i = 0; i < node.childCount; i++) {
                const spec = node.child(i)
                if (spec?.type === 'var_spec' || spec?.type === 'const_spec') {
                    const nameNode = spec.childForFieldName('name')
                    if (nameNode) {
                        symbols.push({
                            name: nameNode.text,
                            kind: 'variable',
                            line: spec.startPosition.row + 1,
                            endLine: spec.endPosition.row + 1,
                        })
                    }
                }
            }
            break
        }

        // Rust: const/static items
        case 'const_item':
        case 'static_item': {
            const nameNode = node.childForFieldName('name')
            if (nameNode) {
                symbols.push({
                    name: nameNode.text,
                    kind: 'variable',
                    line: node.startPosition.row + 1,
                    endLine: node.endPosition.row + 1,
                })
            }
            break
        }

        // Rust: mod declaration
        case 'mod_item': {
            const nameNode = node.childForFieldName('name')
            if (nameNode) {
                symbols.push({
                    name: nameNode.text,
                    kind: 'export',
                    line: node.startPosition.row + 1,
                    endLine: node.endPosition.row + 1,
                })
            }
            break
        }
    }
}

function extractSymbols(rootNode: Parser.SyntaxNode, source: string): RepoSymbol[] {
    const symbols: RepoSymbol[] = []

    for (let i = 0; i < rootNode.childCount; i++) {
        const child = rootNode.child(i)
        if (child) {
            processNode(child, symbols, source)
        }
    }

    return symbols
}

// Node types that represent methods inside a class/struct/impl body
const METHOD_MEMBER_TYPES = new Set([
    'method_definition', // JS/TS, Python, Ruby
    'method_declaration', // Java, C#, Kotlin
    'function_definition', // Python (inside class), C++
    'function_item', // Rust (inside impl)
    'public_field_definition', // TS
    'field_declaration', // Java, C#
    'function_declaration', // Dart, PHP
])

function extractClassMembers(classNode: Parser.SyntaxNode, symbols: RepoSymbol[], source: string): void {
    const body = classNode.childForFieldName('body')
    if (!body) return

    for (let i = 0; i < body.childCount; i++) {
        const member = body.child(i)
        if (!member) continue

        // Handle decorated methods (Python @staticmethod, etc.)
        if (member.type === 'decorated_definition') {
            const definition = member.childForFieldName('definition')
            if (definition && METHOD_MEMBER_TYPES.has(definition.type)) {
                const nameNode = definition.childForFieldName('name')
                if (nameNode) {
                    symbols.push({
                        name: nameNode.text,
                        kind: 'method',
                        line: definition.startPosition.row + 1,
                        endLine: definition.endPosition.row + 1,
                        signature: extractSignature(definition, source),
                    })
                }
            }
            continue
        }

        if (METHOD_MEMBER_TYPES.has(member.type)) {
            const nameNode = member.childForFieldName('name')
            if (nameNode) {
                symbols.push({
                    name: nameNode.text,
                    kind: 'method',
                    line: member.startPosition.row + 1,
                    endLine: member.endPosition.row + 1,
                    signature: extractSignature(member, source),
                })
            }
        }
    }
}

function extractSignature(node: Parser.SyntaxNode, source: string): string {
    const lines = source.split('\n')
    const startLine = node.startPosition.row
    const firstLine = lines[startLine] ?? ''

    const braceIdx = firstLine.indexOf('{')
    if (braceIdx !== -1) {
        return firstLine.slice(0, braceIdx).trim()
    }
    return firstLine.trim()
}
