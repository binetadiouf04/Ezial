import type { HomeCircleTile } from '@/data/categories';
import SmartImage from '@/components/SmartImage';

// Splits tiles round-robin across `rowCount` rows so no two rows end up
// holding the same set of categories (each tile lands in exactly one row).
function distributeIntoRows(tiles: HomeCircleTile[], rowCount: number): HomeCircleTile[][] {
  const rows: HomeCircleTile[][] = Array.from({ length: rowCount }, () => []);
  tiles.forEach((tile, i) => rows[i % rowCount].push(tile));
  return rows;
}

function DiscoverTile({ tile, onNavigate }: { tile: HomeCircleTile; onNavigate: (route: string) => void }) {
  return (
    <button onClick={() => onNavigate(tile.route)} className="group flex w-20 flex-shrink-0 flex-col items-center gap-2 md:w-24">
      <div className="relative aspect-square w-full overflow-hidden rounded-full bg-cream">
        <SmartImage src={tile.image} alt={tile.label} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
        <div className="absolute inset-0 bg-ink/0 transition-colors group-hover:bg-ink/10" />
      </div>
      <span className={`text-center text-[11px] font-medium leading-tight transition-colors md:text-xs ${tile.highlight ? 'text-burgundy font-semibold' : 'text-ink/80 group-hover:text-burgundy'}`}>{tile.label}</span>
    </button>
  );
}

// One infinite, seamless marquee row: the row's tiles are rendered twice
// back-to-back and the track animates by exactly -50% of its own width, so
// the loop point lines up perfectly with no visible jump or gap. Purely a
// CSS transform animation (never a scrollable/overflow-auto element), so it
// can never intercept or block the page's vertical touch-scroll.
function MarqueeRow({ tiles, direction, onNavigate }: { tiles: HomeCircleTile[]; direction: 'left' | 'right'; onNavigate: (route: string) => void }) {
  // Roughly constant visual speed regardless of how many tiles are in the
  // row (more tiles → a wider track → a longer duration to match).
  const durationSeconds = Math.max(22, tiles.length * 6);
  const doubled = [...tiles, ...tiles];

  return (
    <div className="overflow-hidden">
      <div
        className={`marquee-track flex w-max gap-4 md:gap-5 ${direction === 'left' ? 'animate-marquee-left' : 'animate-marquee-right'}`}
        style={{ animationDuration: `${durationSeconds}s` }}
      >
        {doubled.map((tile, i) => (
          <DiscoverTile key={`${tile.id}-${i}`} tile={tile} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

// Tablet/desktop: one dense, static grid — no animation, no duplication.
// A fixed 8-column track (independent of viewport width) means the row
// count is purely a function of the curated tile count, so the 32 curated
// tiles always land in exactly 4 rows (8 × 4), never more and never fewer,
// on every tablet/desktop width — while the grid itself still stretches to
// fill the full available width. Tile size is capped in px (not a
// responsive/full-width circle) and sized so 8 of them always fit within
// the narrowest supported tablet width without wrapping or scrolling.
function GridTile({ tile, onNavigate }: { tile: HomeCircleTile; onNavigate: (route: string) => void }) {
  return (
    <button onClick={() => onNavigate(tile.route)} className="group flex flex-col items-center gap-1.5">
      <div className="relative aspect-square w-[76px] overflow-hidden rounded-full bg-cream">
        <SmartImage src={tile.image} alt={tile.label} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
        <div className="absolute inset-0 bg-ink/0 transition-colors group-hover:bg-ink/10" />
      </div>
      <span className={`text-center text-[10px] font-medium leading-tight transition-colors ${tile.highlight ? 'text-burgundy font-semibold' : 'text-ink/80 group-hover:text-burgundy'}`}>{tile.label}</span>
    </button>
  );
}

function DiscoverGrid({ tiles, onNavigate }: { tiles: HomeCircleTile[]; onNavigate: (route: string) => void }) {
  return (
    <div className="grid grid-cols-8 justify-items-center gap-x-2 gap-y-4">
      {tiles.map((tile) => (
        <GridTile key={tile.id} tile={tile} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

export default function DiscoverMarquee({ tiles, onNavigate }: { tiles: HomeCircleTile[]; onNavigate: (route: string) => void }) {
  const mobileRows = distributeIntoRows(tiles, 2);

  return (
    <>
      {/* Mobile: 2 looping rows — first row left, second row right */}
      <div className="space-y-4 md:hidden">
        {mobileRows.map((rowTiles, i) => (
          <MarqueeRow key={i} tiles={rowTiles} direction={i % 2 === 0 ? 'left' : 'right'} onNavigate={onNavigate} />
        ))}
      </div>

      {/* Tablet/desktop: one dense static grid, no animation, no scroll */}
      <div className="hidden md:block">
        <DiscoverGrid tiles={tiles} onNavigate={onNavigate} />
      </div>
    </>
  );
}
