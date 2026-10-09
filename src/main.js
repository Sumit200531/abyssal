import './style.css';
import { Game } from './game/Game.js';

// Boot the game. Exposed on window for console tinkering: abyssal.debugState()
window.abyssal = new Game();
