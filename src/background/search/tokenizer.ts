// tokenizer.ts — Fast tokenizer for URLs, titles, meta

export function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, " ")
        .split(" ")
        .filter(Boolean);
}