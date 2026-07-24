// Единый источник случайности. По умолчанию Math.random; setRng позволяет подменить
// на сид-PRNG в тестах-регрессах. Весь движок берёт случайность отсюда.
let rand: () => number = Math.random;

export function setRng(fn: () => number): void { rand = fn; }
export function resetRng(): void { rand = Math.random; }

export const rnd = (): number => rand();
export const ri = (a: number, b: number): number => a + Math.floor(rand() * (b - a + 1));
export const rf = (a: number, b: number): number => a + rand() * (b - a);
export const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
