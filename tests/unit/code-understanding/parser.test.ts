import { describe, it, expect } from 'bun:test'
import { parseFileSymbols, isSupportedExtension } from '../../../src/code-understanding/parser.js'

describe('parseFileSymbols', () => {
    it('extracts function declarations from TypeScript', async () => {
        const source = `
function hello(name: string): string {
    return 'Hello ' + name
}

async function fetchData(url: string): Promise<Response> {
    return fetch(url)
}
`
        const result = await parseFileSymbols('test.ts', source)
        expect(result).not.toBeNull()
        expect(result!.language).toBe('ts')

        const names = result!.symbols.map((s) => s.name)
        expect(names).toContain('hello')
        expect(names).toContain('fetchData')

        const hello = result!.symbols.find((s) => s.name === 'hello')
        expect(hello!.kind).toBe('function')
    })

    it('extracts class declarations with methods', async () => {
        const source = `
class UserService {
    async findById(id: string): Promise<User> {
        return this.db.find(id)
    }

    create(data: CreateUserInput): User {
        return new User(data)
    }
}
`
        const result = await parseFileSymbols('service.ts', source)
        expect(result).not.toBeNull()

        const classSymbol = result!.symbols.find((s) => s.kind === 'class')
        expect(classSymbol).toBeDefined()
        expect(classSymbol!.name).toBe('UserService')

        const methods = result!.symbols.filter((s) => s.kind === 'method')
        expect(methods.length).toBe(2)
        expect(methods.map((m) => m.name)).toContain('findById')
        expect(methods.map((m) => m.name)).toContain('create')
    })

    it('extracts interfaces from TypeScript', async () => {
        const source = `
interface Config {
    host: string
    port: number
}

interface Logger {
    info(msg: string): void
}
`
        const result = await parseFileSymbols('types.ts', source)
        expect(result).not.toBeNull()

        const interfaces = result!.symbols.filter((s) => s.kind === 'interface')
        expect(interfaces.length).toBe(2)
        expect(interfaces.map((i) => i.name)).toContain('Config')
        expect(interfaces.map((i) => i.name)).toContain('Logger')
    })

    it('extracts type aliases', async () => {
        const source = `
type UserId = string
type Result<T> = { ok: true; value: T } | { ok: false; error: string }
`
        const result = await parseFileSymbols('aliases.ts', source)
        expect(result).not.toBeNull()

        const types = result!.symbols.filter((s) => s.kind === 'type')
        expect(types.length).toBe(2)
        expect(types.map((t) => t.name)).toContain('UserId')
        expect(types.map((t) => t.name)).toContain('Result')
    })

    it('extracts top-level variables', async () => {
        const source = `
const MAX_RETRIES = 3
const DEFAULT_TIMEOUT = 30000
`
        const result = await parseFileSymbols('constants.ts', source)
        expect(result).not.toBeNull()

        const vars = result!.symbols.filter((s) => s.kind === 'variable')
        expect(vars.length).toBe(2)
        expect(vars.map((v) => v.name)).toContain('MAX_RETRIES')
    })

    it('handles exported declarations', async () => {
        const source = `
export function publicFn(): void {}
export class PublicClass {}
export interface PublicInterface {}
export type PublicType = string
export const PUBLIC_CONST = 42
`
        const result = await parseFileSymbols('exports.ts', source)
        expect(result).not.toBeNull()

        const names = result!.symbols.map((s) => s.name)
        expect(names).toContain('publicFn')
        expect(names).toContain('PublicClass')
        expect(names).toContain('PublicInterface')
        expect(names).toContain('PublicType')
        expect(names).toContain('PUBLIC_CONST')
    })

    it('parses JavaScript files', async () => {
        const source = `
function greet(name) {
    return 'Hello ' + name
}

class Animal {
    speak() { return 'sound' }
}
`
        const result = await parseFileSymbols('app.js', source)
        expect(result).not.toBeNull()
        expect(result!.language).toBe('js')

        const names = result!.symbols.map((s) => s.name)
        expect(names).toContain('greet')
        expect(names).toContain('Animal')
    })

    it('parses Python files', async () => {
        const source = `
class UserRepository:
    def __init__(self, db):
        self.db = db

    def find_by_id(self, user_id: str) -> User:
        return self.db.find(user_id)

    @staticmethod
    def create_default():
        return UserRepository(None)

def process_users(users: list) -> list:
    return [u for u in users if u.active]

BATCH_SIZE = 100
`
        const result = await parseFileSymbols('repo.py', source)
        expect(result).not.toBeNull()
        expect(result!.language).toBe('py')

        const names = result!.symbols.map((s) => s.name)
        expect(names).toContain('UserRepository')
        expect(names).toContain('process_users')

        const methods = result!.symbols.filter((s) => s.kind === 'method')
        const methodNames = methods.map((m) => m.name)
        expect(methodNames).toContain('__init__')
        expect(methodNames).toContain('find_by_id')
    })

    it('parses Rust files', async () => {
        const source = `
struct Config {
    host: String,
    port: u16,
}

impl Config {
    fn new(host: String, port: u16) -> Self {
        Config { host, port }
    }

    fn default() -> Self {
        Config::new("localhost".into(), 8080)
    }
}

trait Service {
    fn start(&self);
    fn stop(&self);
}

enum Status {
    Active,
    Inactive,
}

fn main() {
    let config = Config::default();
}
`
        const result = await parseFileSymbols('main.rs', source)
        expect(result).not.toBeNull()
        expect(result!.language).toBe('rs')

        const names = result!.symbols.map((s) => s.name)
        expect(names).toContain('Config')
        expect(names).toContain('Service')
        expect(names).toContain('Status')
        expect(names).toContain('main')
    })

    it('parses Go files', async () => {
        const source = `
package main

type Server struct {
    Host string
    Port int
}

func NewServer(host string, port int) *Server {
    return &Server{Host: host, Port: port}
}

func (s *Server) Start() error {
    return nil
}

type Handler interface {
    Handle(req Request) Response
}
`
        const result = await parseFileSymbols('server.go', source)
        expect(result).not.toBeNull()
        expect(result!.language).toBe('go')

        const names = result!.symbols.map((s) => s.name)
        expect(names).toContain('NewServer')
        expect(names).toContain('Start')
    })

    it('returns null for unsupported extensions', async () => {
        const result = await parseFileSymbols('data.csv', 'a,b,c')
        expect(result).toBeNull()
    })
})

describe('isSupportedExtension', () => {
    it('supports TypeScript extensions', () => {
        expect(isSupportedExtension('.ts')).toBe(true)
        expect(isSupportedExtension('.tsx')).toBe(true)
    })

    it('supports JavaScript extensions', () => {
        expect(isSupportedExtension('.js')).toBe(true)
        expect(isSupportedExtension('.jsx')).toBe(true)
    })

    it('supports other languages', () => {
        expect(isSupportedExtension('.py')).toBe(true)
        expect(isSupportedExtension('.rs')).toBe(true)
        expect(isSupportedExtension('.go')).toBe(true)
        expect(isSupportedExtension('.java')).toBe(true)
        expect(isSupportedExtension('.rb')).toBe(true)
        expect(isSupportedExtension('.cpp')).toBe(true)
        expect(isSupportedExtension('.cs')).toBe(true)
        expect(isSupportedExtension('.swift')).toBe(true)
        expect(isSupportedExtension('.kt')).toBe(true)
    })

    it('rejects unsupported extensions', () => {
        expect(isSupportedExtension('.csv')).toBe(false)
        expect(isSupportedExtension('.txt')).toBe(false)
        expect(isSupportedExtension('.md')).toBe(false)
    })
})
