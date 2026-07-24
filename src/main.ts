import { mount } from 'svelte';
import App from './App.svelte';
import './styles/tokens.css';
import './styles/global.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app not found');

const app = mount(App, { target });
export default app;
