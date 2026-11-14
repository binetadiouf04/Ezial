import { useEffect, useMemo, useRef, useState } from 'react';
import { niceScale, axisLabelIndexes } from '@/lib/adminStatsCore';

export interface ColumnPoint {
  key: string;
  /** Libellé court de l'axe (« 13 nov. »). */
  label: string;
  /** Libellé complet de l'info-bulle (« 13 nov. 2026 »). */
  longLabel: string;
  value: number;
}

interface ColumnChartProps {
  points: ColumnPoint[];
  /** Nom de la mesure, lu par les lecteurs d'écran et affiché dans l'info-bulle. */
  measure: string;
  formatValue: (n: number) => string;
  formatAxis: (n: number) => string;
  integerOnly?: boolean;
}

// Couleurs de l'identité Ezial : rouge rubis pour les colonnes, bordeaux au
// survol ; grille et axes discrets.
const SERIES = '#8C1024';
const SERIES_ACTIVE = '#5A0D1E';
const GRID = '#E8E5E1';
const HEIGHT = 220;
const MARGIN = { top: 22, right: 6, bottom: 24 };

/** Colonne à sommet arrondi (4 px), base droite posée sur l'axe. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

export default function ColumnChart({ points, measure, formatValue, formatAxis, integerOnly = false }: ColumnChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = useMemo(() => niceScale(Math.max(0, ...points.map((p) => p.value)), integerOnly), [points, integerOnly]);
  const tickLabels = scale.ticks.map(formatAxis);
  const marginLeft = Math.max(28, Math.max(...tickLabels.map((t) => t.length)) * 6.4 + 10);
  const innerW = Math.max(0, width - marginLeft - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const band = points.length > 0 ? innerW / points.length : 0;
  const barW = Math.max(2, Math.min(24, band - 2));
  const y = (v: number) => MARGIN.top + innerH - (scale.max > 0 ? (v / scale.max) * innerH : 0);
  const xLabels = axisLabelIndexes(points.length, Math.max(2, Math.floor(innerW / 64)));
  const peak = points.reduce((best, p, i) => (p.value > (points[best]?.value ?? 0) ? i : best), 0);
  const activePoint = active !== null ? points[active] : null;
  const tooltipLeft = active !== null ? Math.min(Math.max(marginLeft + band * active + band / 2, 70), Math.max(70, width - 70)) : 0;

  return (
    <div ref={wrapRef} className="relative" onPointerLeave={() => setActive(null)}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={`${measure} par période. Les valeurs sont aussi disponibles dans le tableau ci-dessous.`}>
          {scale.ticks.map((t, i) => (
            <g key={t}>
              <line x1={marginLeft} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={marginLeft - 8} y={y(t) + 3.5} textAnchor="end" fontSize={11} fill="rgba(23,23,23,0.5)" style={{ fontVariantNumeric: 'tabular-nums' }}>{tickLabels[i]}</text>
            </g>
          ))}
          {points.map((p, i) => {
            const h = scale.max > 0 ? (p.value / scale.max) * innerH : 0;
            const x = marginLeft + band * i + (band - barW) / 2;
            return h > 0 ? <path key={p.key} d={columnPath(x, y(p.value), barW, h)} fill={active === i ? SERIES_ACTIVE : SERIES} /> : null;
          })}
          {/* Seul le maximum porte sa valeur : les autres se lisent sur l'axe, au survol ou dans le tableau. */}
          {points[peak] && points[peak].value > 0 && active === null && (
            <text
              x={Math.min(Math.max(marginLeft + band * peak + band / 2, marginLeft + 24), width - MARGIN.right - 24)}
              y={y(points[peak].value) - 6}
              textAnchor="middle" fontSize={11} fontWeight={600} fill="#171717"
            >
              {formatAxis(points[peak].value)}
            </text>
          )}
          {xLabels.map((i) => (
            <text
              key={points[i].key}
              x={marginLeft + band * i + band / 2}
              y={HEIGHT - 6}
              textAnchor={i === 0 && band < 48 ? 'start' : i === points.length - 1 && band < 48 ? 'end' : 'middle'}
              fontSize={11} fill="rgba(23,23,23,0.5)"
            >
              {points[i].label}
            </text>
          ))}
          {/* Zones de survol : toute la hauteur de la bande, plus large que la colonne. */}
          {points.map((p, i) => (
            <rect
              key={p.key}
              x={marginLeft + band * i} y={MARGIN.top} width={Math.max(band, 1)} height={innerH}
              fill="transparent" tabIndex={0} role="img"
              aria-label={`${p.longLabel} : ${formatValue(p.value)}`}
              onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)}
              onFocus={() => setActive(i)} onBlur={() => setActive(null)}
              style={{ outline: 'none', cursor: 'default' }}
            />
          ))}
        </svg>
      )}
      {activePoint && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-white px-2.5 py-1.5 text-center shadow-[0_6px_20px_-8px_rgba(23,23,23,0.25)]"
          style={{ left: tooltipLeft, top: Math.max(0, y(activePoint.value) - 52) }}
        >
          <p className="text-sm font-semibold text-ink">{formatValue(activePoint.value)}</p>
          <p className="text-[11px] text-ink/55">{activePoint.longLabel}</p>
        </div>
      )}
      {width === 0 && <div style={{ height: HEIGHT }} />}
    </div>
  );
}
