// Types of index.mjs for the hooks module and the tests.
export declare const LOCALES: Readonly<Record<string, Readonly<Record<string, string>>>>
export declare function langOf(choice: unknown, system?: string): string
export declare function fill(text: string, vars?: Readonly<Record<string, string | number>>): string
