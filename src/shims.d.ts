declare module 'crypto' {
  export function createHmac(alg: string, key: any): { update(data: any): any; digest(encoding: string): string };
}

declare module 'buffer' {
  export const Buffer: any;
}

declare module 'assert/strict' {
  const assert: any;
  export = assert;
}

declare module 'node:test' {
  export const test: any;
}
