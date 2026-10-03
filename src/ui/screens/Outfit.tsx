import library from '../../library/index.js';
import { Card, CardList } from '../components/Card';
import { copy } from '../copy.js';
import { useBuilder } from '../store.js';
import { Station } from './Station.js';

// Station 6. Twelve cards in library order, each with its sample "hey". Nothing shows as selected until a
// pick; Next before that continues on the default outfit (QUESTIONS U3). Skip is allowed (Station).
export function Outfit() {
  const outfit = useBuilder((s) => s.draft.outfit);
  const setOutfit = useBuilder((s) => s.setOutfit);

  return (
    <Station screen="outfit">
      <CardList label={copy.screens.outfit.title}>
        {library.outfits.map((o) => (
          <Card
            key={o.id}
            title={o.card}
            sample={o.sampleHey}
            selected={o.id === outfit}
            onSelect={() => setOutfit(o.id)}
          />
        ))}
      </CardList>
    </Station>
  );
}
