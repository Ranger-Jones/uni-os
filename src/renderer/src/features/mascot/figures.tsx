import type { ReactNode } from 'react'
import type { AnimalId } from '@core/domain/mascot'

/*
 * The mascots share one skeleton (viewBox 120×150): legs, body with belly, two arms that swing from the
 * shoulders, a head that tilts on the neck, eyes that blink, and an optional tail. Each animal adds its
 * own ears, face and colours. Parts carry class names that mascot.css animates.
 */

const INK = '#2e2a26'
const LINE = { stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

interface Look {
  fur: string
  light: string
  dark: string
  /** Fill of arms and legs (defaults to fur). */
  limbs?: string
  /** Head: circle, or wide oval for the frog. */
  wideHead?: boolean
  eyes?: { y: number; dx: number; white?: boolean }
  cheeks?: boolean
  behindHead?: ReactNode
  face: ReactNode
  /** Drawn behind the body; animated as the tail. */
  tail?: ReactNode
  belly?: ReactNode
}

/** A thick line with an ink outline, for tails and whiskery bits. */
const OutlinedStroke = ({ d, color, width }: { d: string; color: string; width: number }) => (
  <>
    <path d={d} fill="none" stroke={INK} strokeWidth={width + 4.4} strokeLinecap="round" />
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" />
  </>
)

const smile = (y = 68, w = 6) => <path d={`M ${60 - w} ${y} Q 60 ${y + 5} ${60 + w} ${y}`} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />

const LOOKS: Record<AnimalId, Look> = {
  monkey: {
    fur: '#9a6a43',
    light: '#f1d2ad',
    dark: '#6e4a2e',
    behindHead: (
      <>
        <circle cx={31} cy={56} r={10} fill="#9a6a43" {...LINE} />
        <circle cx={31} cy={56} r={5.5} fill="#f1d2ad" />
        <circle cx={89} cy={56} r={10} fill="#9a6a43" {...LINE} />
        <circle cx={89} cy={56} r={5.5} fill="#f1d2ad" />
      </>
    ),
    face: (
      <>
        <circle cx={50} cy={53} r={11} fill="#f1d2ad" />
        <circle cx={70} cy={53} r={11} fill="#f1d2ad" />
        <ellipse cx={60} cy={67} rx={17} ry={12} fill="#f1d2ad" />
        <circle cx={57} cy={63} r={1.3} fill={INK} />
        <circle cx={63} cy={63} r={1.3} fill={INK} />
        {smile(70, 7)}
      </>
    ),
    tail: <OutlinedStroke d="M 82 114 C 106 118, 110 92, 99 84 C 92 79, 85 86, 91 91" color="#9a6a43" width={5.5} />
  },
  cat: {
    fur: '#eea05a',
    light: '#fff3e3',
    dark: '#d27f36',
    behindHead: (
      <>
        <path d="M 36 42 L 39 15 L 59 31 Z" fill="#eea05a" {...LINE} />
        <path d="M 41 36 L 42 22 L 52 30 Z" fill="#f7b9b0" />
        <path d="M 84 42 L 81 15 L 61 31 Z" fill="#eea05a" {...LINE} />
        <path d="M 79 36 L 78 22 L 68 30 Z" fill="#f7b9b0" />
      </>
    ),
    face: (
      <>
        <path d="M 54 30 L 55 38 M 60 28 L 60 37 M 66 30 L 65 38" stroke="#d27f36" strokeWidth={2.6} strokeLinecap="round" />
        <ellipse cx={60} cy={67} rx={12} ry={8} fill="#fff3e3" />
        <path d="M 57 61 L 63 61 L 60 64.5 Z" fill="#e88f8a" />
        <path d="M 60 64.5 Q 57 69 54 67 M 60 64.5 Q 63 69 66 67" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />
        <path d="M 38 62 L 26 59 M 38 66 L 26 67 M 82 62 L 94 59 M 82 66 L 94 67" stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
      </>
    ),
    tail: <OutlinedStroke d="M 83 118 C 105 114, 106 88, 97 77" color="#eea05a" width={7} />
  },
  dog: {
    fur: '#c99a63',
    light: '#f6e6cf',
    dark: '#7a5232',
    face: (
      <>
        <ellipse cx={71} cy={52} rx={9} ry={8} fill="#7a5232" opacity={0.85} />
        <ellipse cx={60} cy={67} rx={14} ry={10} fill="#f6e6cf" />
        <ellipse cx={60} cy={61.5} rx={5} ry={3.6} fill={INK} />
        <path d="M 60 65 L 60 69 M 54 70 Q 60 74 66 70" fill="none" stroke={INK} strokeWidth={1.9} strokeLinecap="round" />
        {/* floppy ears hang in front of the head */}
        <ellipse cx={33} cy={58} rx={8.5} ry={17} transform="rotate(18 33 58)" fill="#7a5232" {...LINE} />
        <ellipse cx={87} cy={58} rx={8.5} ry={17} transform="rotate(-18 87 58)" fill="#7a5232" {...LINE} />
      </>
    ),
    tail: <OutlinedStroke d="M 83 112 Q 98 108 100 95" color="#c99a63" width={6} />
  },
  panda: {
    fur: '#fbfbf7',
    light: '#ffffff',
    dark: '#2e2a26',
    limbs: '#2e2a26',
    eyes: { y: 53, dx: 10, white: true },
    behindHead: (
      <>
        <circle cx={37} cy={31} r={9.5} fill="#2e2a26" {...LINE} />
        <circle cx={83} cy={31} r={9.5} fill="#2e2a26" {...LINE} />
      </>
    ),
    face: (
      <>
        <ellipse cx={49} cy={54} rx={8} ry={10} transform="rotate(25 49 54)" fill="#2e2a26" />
        <ellipse cx={71} cy={54} rx={8} ry={10} transform="rotate(-25 71 54)" fill="#2e2a26" />
        <ellipse cx={60} cy={63} rx={3.6} ry={2.6} fill={INK} />
        {smile(68, 5)}
      </>
    )
  },
  fox: {
    fur: '#e5793b',
    light: '#fff4ea',
    dark: '#3a2a22',
    limbs: '#3a2a22',
    behindHead: (
      <>
        <path d="M 35 44 L 34 12 L 58 30 Z" fill="#e5793b" {...LINE} />
        <path d="M 37 22 L 35 13 L 44 19 Z" fill="#3a2a22" />
        <path d="M 85 44 L 86 12 L 62 30 Z" fill="#e5793b" {...LINE} />
        <path d="M 83 22 L 85 13 L 76 19 Z" fill="#3a2a22" />
      </>
    ),
    face: (
      <>
        <path d="M 32 58 Q 46 70 60 67 Q 74 70 88 58 Q 82 80 60 82 Q 38 80 32 58 Z" fill="#fff4ea" />
        <ellipse cx={60} cy={66} rx={3.8} ry={2.8} fill={INK} />
        {smile(71, 5)}
      </>
    ),
    tail: (
      <>
        <ellipse cx={97} cy={102} rx={12} ry={25} transform="rotate(38 97 102)" fill="#e5793b" {...LINE} />
        <ellipse cx={109} cy={85} rx={6.5} ry={8} transform="rotate(38 109 85)" fill="#fff4ea" />
      </>
    )
  },
  penguin: {
    fur: '#33404f',
    light: '#ffffff',
    dark: '#1f2833',
    limbs: '#33404f',
    eyes: { y: 55, dx: 9 },
    cheeks: true,
    face: (
      <>
        <circle cx={51} cy={57} r={12} fill="#ffffff" />
        <circle cx={69} cy={57} r={12} fill="#ffffff" />
        <ellipse cx={60} cy={68} rx={14} ry={9} fill="#ffffff" />
        <path d="M 54 63 Q 60 59 66 63 Q 60 70 54 63 Z" fill="#f2a33a" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
      </>
    ),
    belly: <ellipse cx={60} cy={106} rx={18} ry={21} fill="#ffffff" />
  },
  frog: {
    fur: '#7cc26a',
    light: '#dff2c9',
    dark: '#4e8f40',
    wideHead: true,
    eyes: { y: 37, dx: 15, white: true },
    behindHead: (
      <>
        <circle cx={45} cy={37} r={11.5} fill="#7cc26a" {...LINE} />
        <circle cx={75} cy={37} r={11.5} fill="#7cc26a" {...LINE} />
      </>
    ),
    face: <path d="M 40 64 Q 60 78 80 64" fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
  },
  owl: {
    fur: '#8b6b4f',
    light: '#f3e3c8',
    dark: '#5e4733',
    eyes: { y: 53, dx: 11, white: true },
    behindHead: (
      <>
        <path d="M 36 38 L 34 17 L 52 29 Z" fill="#8b6b4f" {...LINE} />
        <path d="M 84 38 L 86 17 L 68 29 Z" fill="#8b6b4f" {...LINE} />
      </>
    ),
    face: (
      <>
        <circle cx={49} cy={53} r={12.5} fill="#f3e3c8" />
        <circle cx={71} cy={53} r={12.5} fill="#f3e3c8" />
        <path d="M 56.5 62 L 63.5 62 L 60 69 Z" fill="#f2a33a" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
      </>
    ),
    belly: (
      <>
        <ellipse cx={60} cy={105} rx={16} ry={19} fill="#f3e3c8" />
        <path d="M 52 98 l 3 3 l 3 -3 M 62 98 l 3 3 l 3 -3 M 57 107 l 3 3 l 3 -3" fill="none" stroke="#8b6b4f" strokeWidth={1.6} strokeLinecap="round" />
      </>
    )
  }
}

export const FIGURE_COLORS: Record<AnimalId, string> = Object.fromEntries(Object.entries(LOOKS).map(([id, l]) => [id, l.fur])) as Record<AnimalId, string>

/** One mascot as SVG. Animations come from the wrapping .mascot element (see mascot.css). */
export function Figure({ animal, className }: { animal: AnimalId; className?: string }) {
  const l = LOOKS[animal] ?? LOOKS.monkey
  const limbs = l.limbs ?? l.fur
  const eyes = l.eyes ?? { y: 53, dx: 10 }
  return (
    <svg viewBox="0 0 120 150" className={className} aria-hidden="true">
      <g className="m-root">
        {l.tail && <g className="m-tail">{l.tail}</g>}
        <ellipse className="m-leg-l" cx={48} cy={129} rx={9} ry={7} fill={limbs} {...LINE} />
        <ellipse className="m-leg-r" cx={72} cy={129} rx={9} ry={7} fill={limbs} {...LINE} />
        <ellipse cx={60} cy={102} rx={25} ry={27} fill={l.fur} {...LINE} />
        {l.belly ?? <ellipse cx={60} cy={106} rx={15} ry={17} fill={l.light} />}
        <rect className="m-arm-l" x={34} y={86} width={12} height={28} rx={6} fill={limbs} {...LINE} />
        <rect className="m-arm-r" x={74} y={86} width={12} height={28} rx={6} fill={limbs} {...LINE} />
        <g className="m-head">
          {l.behindHead}
          {l.wideHead ? <ellipse cx={60} cy={58} rx={33} ry={25} fill={l.fur} {...LINE} /> : <circle cx={60} cy={54} r={29} fill={l.fur} {...LINE} />}
          {l.face}
          {(l.cheeks ?? true) && (
            <>
              <ellipse cx={42} cy={66} rx={5} ry={3} fill="#f08c8c" opacity={0.45} />
              <ellipse cx={78} cy={66} rx={5} ry={3} fill="#f08c8c" opacity={0.45} />
            </>
          )}
          <g className="m-eyes" style={{ transformOrigin: `60px ${eyes.y}px` }}>
            {[60 - eyes.dx, 60 + eyes.dx].map((x) => (
              <g key={x}>
                {eyes.white && <circle cx={x} cy={eyes.y} r={5.6} fill="#ffffff" stroke={INK} strokeWidth={1.4} />}
                <ellipse cx={x} cy={eyes.y} rx={eyes.white ? 3 : 3.6} ry={eyes.white ? 3.4 : 4.3} fill={INK} />
                <circle cx={x + 1.2} cy={eyes.y - 1.6} r={1.2} fill="#ffffff" />
              </g>
            ))}
          </g>
        </g>
      </g>
    </svg>
  )
}
