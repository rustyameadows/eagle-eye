import { useEffect, useId, useState } from 'react'
import { Stage, type Act } from '../../kit'
import { ProofScene, annotationFont } from './proofs'

// Stageshow authoring scene. The images are the compact 390 CSS px captures
// at 2× density. All source windows and guide positions below use native pixels.
type Subject = 'example-4-tab' | 'example-4-list'
type State = { time: number }
const period = 10800
const initial = { time: 0 }
const poster = { time: 7900 }
const canvas = '#f2f2f2'
const surface = '#ffffff'
const ink = '#171717'
const guide = '#383838'
const measuredInk = '#555555'
const files = ['p01-compact.png', 'p02-compact.png', 'p03-compact.png']

function ramp(t: number, a: number, b: number) {
  const n = Math.max(0, Math.min(1, (t - a) / (b - a)))
  return n * n * (3 - 2 * n)
}

async function play(a: Act<State>) {
  for (let time = 0; time < period - 80; time += 80) {
    a.put({ time })
    await a.wait(80)
  }
  a.put(initial)
  await a.wait(80)
}

function Shot({ file, x, y, w, h, sx, sy, zoom = 1 }: {
  file: string; x: number; y: number; w: number; h: number; sx: number; sy: number; zoom?: number
}) {
  return <svg x={x} y={y} width={w} height={h} viewBox={`${sx} ${sy} ${w/zoom} ${h/zoom}`} overflow="hidden">
    <image href={'/eagle-evidence/' + file} width={780} height={720} style={{imageRendering:zoom>1?"pixelated":"auto"}} />
  </svg>
}

function Scene({ subject, compact, time }: { subject: Subject; compact: boolean; time: number }) {
  const key = useId().replace(/:/g, '')
  const folder = subject === 'example-4-tab'
  const before = files[folder ? 0 : 1], after = files[folder ? 1 : 2]
  const width = compact ? 358 : 744, height = compact ? 416 : 302
  const panelX = compact ? 0 : 348, panelY = compact ? 156 : 0
  const panelW = width - panelX, panelH = height - panelY
  const pad = compact ? 15 : 19
  const dx = panelX + pad, dy = panelY + (compact ? 48 : 61)
  const dw = panelW - pad * 2, dh = compact ? 120 : 150
  const midY = dy + dh / 2
  const guideAmount = ramp(time, 1100, 2250) * (1-ramp(time, 9300, 10200))
  const repaired = ramp(time, 4800, 5550) * (1-ramp(time, 9400, 10080))
  const originalPhase = 1 - ramp(time, 4600, 4800) + ramp(time, 10000, 10200)
  const retest = ramp(time, 5550, 5750) * (1 - ramp(time, 9150, 9350))
  const opening = 1 - ramp(time, 1800, 2000) + ramp(time, 10000, 10200)
  const comparing = ramp(time, 4800, 4950) * (1 - ramp(time, 5350, 5550))
    + ramp(time, 9350, 9500) * (1 - ramp(time, 9800, 10000))
  const measured = ramp(time, 2000, 2250) * (1 - ramp(time, 4600, 4800))
  const imageReveal = folder ? repaired : Number(repaired >= 0.5)
  const changing = repaired > 0 && repaired < 1
  const dimX = compact ? 5 : 8, dimY = compact ? 39 : 43
  const screenScale = compact ? .446 : .426
  const screenTop = compact ? (folder ? 124 : 275) : 0
  const screenHeight = compact ? ((folder ? 355 : 521) - screenTop) * screenScale : 234
  const panelClip = 'panel-' + key, detailClip = 'detail-' + key, contextClip = 'context-' + key
  const bracketX = dimX + (folder ? 69 : 50) * screenScale
  const bracketY = dimY + ((folder ? 195 : 298) - screenTop) * screenScale
  const bracketW = (folder ? 49 : 34) * screenScale
  const bracketH = (folder ? 46 : 198) * screenScale
  const contextWidth = 780 * screenScale
  // Fit the full tab so its two edges remain visible in the proof.
  const tabZoom = compact ? 1.13 : 1.25
  const tabLeft = dx + (dw - 232 * tabZoom) / 2
  const iconCenter = tabLeft + (94 - 58) * tabZoom
  const tabHalf = 28 * tabZoom
  const inkY = midY + 6 * tabZoom
  const details = (file: string) => folder
    ? <Shot file={file} x={tabLeft-5} y={midY-tabHalf-4} w={232*tabZoom+10} h={2*tabHalf+8}
        sx={58-5/tabZoom} sy={190-4/tabZoom} zoom={tabZoom}/>
    : <Shot file={file} x={dx+30} y={dy} w={dw-60} h={dh} sx={30} sy={278} zoom={dh/236}/>
  const context = (file: string) =>
    <Shot file={file} x={dimX} y={dimY} w={contextWidth} h={screenHeight} sx={0} sy={screenTop} zoom={screenScale}/>
  const rowScale = dh / 236, railX = dx+30+(58-30)*rowScale
  const rowCenter = dy+(396-278)*rowScale
  const gap = 12*rowScale
  const barY = compact ? panelY+222 : 269
  return <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{display:'block', fontFamily:annotationFont}}
      role="img" aria-label={folder ? 'Checking the folder against the midpoint of its tab' : 'Checking the inset of the middle file against its siblings'}>
    <defs>
      <clipPath id={contextClip}><rect x={dimX} y={dimY} width={contextWidth*imageReveal} height={screenHeight}/></clipPath>
      <clipPath id={panelClip}><rect x={dx} y={dy} width={dw} height={dh} rx="0"/></clipPath>
      <clipPath id={detailClip}><rect x={dx} y={dy} width={dw*imageReveal} height={dh}/></clipPath>
    </defs>
    <rect width={width} height={height} fill={canvas}/>
    <text x={compact?13:18} y={compact?23:29} fontSize="13" fontWeight="700" fill="#202020">Example 4</text>
    <text x={compact?344:329} y={compact?23:29} textAnchor="end" fontSize="12.5" fill="#525252">390 CSS px · 2×</text>
    {context(before)}
    <g clipPath={`url(#${contextClip})`}>{context(after)}</g>
    <g opacity={guideAmount} fill="none" stroke={guide} strokeWidth="1.4">
      <rect x={bracketX} y={bracketY} width={bracketW} height={bracketH} rx="3"/>
    </g>
    <rect x={panelX} y={panelY} width={panelW} height={panelH} fill={surface}/>
    <text x={dx} y={panelY+(compact?32:40)} fontSize={compact?22:26} fill="#171717">{folder?'Tab midpoint':'List leading edge'}</text>
    <g textAnchor="end" fontSize="14" fill={ink}>
      <text x={dx+dw} y={panelY+(compact?30:37)} opacity={originalPhase}>Original</text>
      <text x={dx+dw} y={panelY+(compact?30:37)} opacity={retest}>Retest</text>
    </g>
    <g clipPath={`url(#${panelClip})`}>
      <rect x={dx} y={dy} width={dw} height={dh} fill={folder?'#fbfbfb':'#ffffff'}/>
      {details(before)}
      <g clipPath={`url(#${detailClip})`}>{details(after)}</g>
      {folder && <g opacity={guideAmount}>
        <path d={`M ${tabLeft-5} ${midY-tabHalf} h -7 v ${tabHalf*2} h 7`}
          fill="none" stroke={guide} strokeWidth="1.25"/>
        <path d={`M ${tabLeft-12} ${midY} h ${(iconCenter-tabLeft+38)*guideAmount}`}
          stroke={guide} strokeWidth="1.5"/>
        <text x={tabLeft-13} y={midY-tabHalf-7} fontSize="13" fill={guide}>28 px tab</text>
        <g opacity={1-repaired}>
          <path d={`M ${iconCenter} ${inkY} h 21 l 16 ${tabHalf-4} h 13`} fill="none"
            stroke={measuredInk} strokeDasharray="3 2" strokeWidth="1.4"/>
          <circle cx={iconCenter} cy={inkY} r="3.2" fill={measuredInk} stroke="white"/>
          <text x={iconCenter+56} y={inkY+tabHalf} fontSize="13" fill={measuredInk}>Ink center</text>
        </g>
        <circle cx={iconCenter} cy={midY} r="3.2" fill={guide} stroke="white" opacity={repaired}/>
      </g>}
      {!folder && <g opacity={guideAmount}>
        <path d={`M ${railX} ${dy+6} v ${(dh-12)*guideAmount}`} stroke={guide} strokeWidth="1.5"/>
        <g opacity={1-repaired} stroke={measuredInk} fill="none" strokeWidth="1.5">
          <path d={`M ${railX} ${rowCenter+12} h ${gap} m 0 3 v -14`}/>
          <circle cx={railX+gap} cy={rowCenter-1} r="3" stroke="white" fill={measuredInk}/>
        </g>
      </g>}
      {folder && changing && <path d={`M ${dx+dw*imageReveal} ${dy} v ${dh}`} stroke="#666666" strokeWidth="1.4"/>}
    </g>
    <g fill="#202020" fontSize={compact?15:17}>
      <text x={dx} y={barY-4} opacity={opening}>{folder?'Find the center of the 28 px tab':'Use the outer two markers as the guide'}</text>
      <text x={dx} y={barY-4} opacity={comparing}>Comparing the same crop</text>
      <g opacity={measured}>
        <text x={dx} y={barY} fontSize={compact?32:37} fontWeight="700" fill="#171717">{folder?'+3 px':'+6 px'}</text>
        <text x={dx+(compact?105:119)} y={barY-2}>{folder?'Below the tab midpoint':'Indented past its siblings'}</text>
      </g>
      <g opacity={retest}>
        <text x={dx} y={barY} fontSize={compact?32:37} fontWeight="700" fill={ink}>0 px</text>
        <text x={dx+(compact?105:119)} y={barY-2}>{folder?'Centered in the tab':'Three markers aligned'}</text>
      </g>
    </g>
  </svg>
}

export default function Walkthrough() {
  const query = new URLSearchParams(location.search)
  const subject = query.get('subject')
  const proof = subject === 'example-2' || subject === 'example-3' || subject === 'example-1' ? subject : null
  const exporting = query.has('frames')
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (!exporting) return
    const seek = (event: Event) => setFrame((event as CustomEvent<number>).detail)
    window.addEventListener('eagle-seek', seek)
    return () => window.removeEventListener('eagle-seek', seek)
  }, [exporting])
  return <Stage width={744} height={302} compact={{below:590,width:358,height:416}} initial={initial} poster={poster}
      script={exporting?undefined:play} play="loop">
    {(s, _rect, layout) => {
      const props = { compact: layout === 'compact', time: exporting ? frame : s.time }
      return proof ? <ProofScene {...props} subject={proof}/> : <Scene {...props} subject={subject === 'example-4-list' ? 'example-4-list' : 'example-4-tab'}/>
    }}
  </Stage>
}
