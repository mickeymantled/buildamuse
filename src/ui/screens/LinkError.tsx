import { Screen } from '../components/Screen';
import { copy } from '../copy.js';
import { useBuilder } from '../store.js';

// Shown ahead of every screen when a share link could not be decoded or validated (W26).
// One plain message and one way out. Nothing from the link, and no developer text, reaches the page.
export function LinkError() {
  const reset = useBuilder((s) => s.reset);
  return (
    <Screen
      title={copy.linkError.title}
      subtitle={copy.linkError.message}
      primary={{ label: copy.linkError.startOver, onClick: reset }}
    >
      {null}
    </Screen>
  );
}
