export interface FileSystem {
  readText(path: string): Promise<string>;
  readJSON<T>(path: string): Promise<T>;
  writeText(path: string, content: string): Promise<void>;
  writeJSON(path: string, data: unknown): Promise<void>;
  exists(path: string): Promise<boolean>;
  glob(pattern: string, cwd?: string): Promise<string[]>;
  mkdir(path: string): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  remove(path: string): Promise<void>;
}

export class BunFileSystem implements FileSystem {
  async readText(path: string): Promise<string> {
    return Bun.file(path).text();
  }

  async readJSON<T>(path: string): Promise<T> {
    return Bun.file(path).json() as Promise<T>;
  }

  async writeText(path: string, content: string): Promise<void> {
    await Bun.write(path, content);
  }

  async writeJSON(path: string, data: unknown): Promise<void> {
    await Bun.write(path, JSON.stringify(data, null, 2));
  }

  async exists(path: string): Promise<boolean> {
    return Bun.file(path).exists();
  }

  async glob(pattern: string, cwd?: string): Promise<string[]> {
    const { Glob } = await import('bun');
    const g = new Glob(pattern);
    const results: string[] = [];
    for await (const file of g.scan({ cwd: cwd ?? '.', absolute: true })) {
      results.push(file);
    }
    return results;
  }

  async mkdir(path: string): Promise<void> {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path, { recursive: true });
  }

  async chmod(path: string, mode: number): Promise<void> {
    const { chmod } = await import('node:fs/promises');
    await chmod(path, mode);
  }

  async remove(path: string): Promise<void> {
    const { rm } = await import('node:fs/promises');
    await rm(path, { recursive: true, force: true });
  }
}

export class MockFileSystem implements FileSystem {
  private files = new Map<string, string>();

  async readText(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  }

  async readJSON<T>(path: string): Promise<T> {
    return JSON.parse(await this.readText(path)) as T;
  }

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async writeJSON(path: string, data: unknown): Promise<void> {
    this.files.set(path, JSON.stringify(data, null, 2));
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async glob(pattern: string, _cwd?: string): Promise<string[]> {
    const regex = new RegExp(
      `^${pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.')}$`,
    );
    return [...this.files.keys()].filter((k) => regex.test(k));
  }

  async mkdir(_path: string): Promise<void> {}

  async chmod(_path: string, _mode: number): Promise<void> {}

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  getFiles(): Map<string, string> {
    return new Map(this.files);
  }
}
