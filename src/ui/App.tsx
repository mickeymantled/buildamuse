import { copy } from './copy.js';
import { useBuilder } from './store.js';

// Placeholder shell. The real screens replace this in slice 3.4.
export function App() {
  const screen = useBuilder((s) => s.screen);
  return <main data-screen={screen}>{copy.screens[screen].title}</main>;
}
