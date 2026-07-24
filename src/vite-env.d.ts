/// <reference types="svelte" />
/// <reference types="vite/client" />

// Ambient-объявление для импорта .svelte из .ts-файлов (напр. main.ts → App.svelte).
// Импорты .svelte → .svelte svelte-check типизирует точно и без этого — здесь только .ts-граница.
declare module '*.svelte' {
  import type { Component } from 'svelte';
  const component: Component;
  export default component;
}
