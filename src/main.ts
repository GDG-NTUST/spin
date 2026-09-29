import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import { initThemeToggle } from './ui/themeToggle';

initThemeToggle(document.querySelector<HTMLButtonElement>('#theme-toggle')!);
