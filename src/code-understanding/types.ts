export interface RepoSymbol {
    name: string
    kind: 'function' | 'class' | 'method' | 'interface' | 'type' | 'variable' | 'export'
    line: number
    endLine: number
    signature?: string
}

export interface FileSymbols {
    filePath: string
    language: string
    symbols: RepoSymbol[]
}
