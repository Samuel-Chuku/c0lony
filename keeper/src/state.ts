import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Small JSON file store with atomic writes (write to temp, then rename). */
export class JsonStore<T> {
  private readonly path: string;
  private readonly initial: T;

  constructor(path: string, initial: T) {
    this.path = path;
    this.initial = initial;
  }

  read(): T {
    try {
      return JSON.parse(readFileSync(this.path, "utf8")) as T;
    } catch {
      return structuredClone(this.initial);
    }
  }

  write(value: T): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(value, null, 2));
    renameSync(tmp, this.path);
  }
}
