import './annotations.css'
import desk from './desk/measurements.json'
import headline from './example-1/pair.json'

export type Proof = 'example-2' | 'example-3' | 'example-1'
export const squareSize = 432
export type SceneLayout = 'wide' | 'compact' | 'square'
export function sceneSize(layout: SceneLayout) {
  if (layout === 'square') return { width: squareSize, height: squareSize }
  return layout === 'compact' ? { width: 358, height: 416 } : { width: 744, height: 302 }
}
export const annotationFont = '"Eagle Eye Annotations", Helvetica, "Nimbus Sans", Arial, sans-serif'
const surface = '#ffffff'
const paper = '#f5f5f5'
const guide = '#383838'
const measuredInk = '#555555'
const ink = '#171717'

function reveal(t: number, start: number, end: number) {
  const n = Math.max(0, Math.min(1, (t - start) / (end - start)))
  return n * n * (3 - 2 * n)
}

// All source rectangles are in native raster pixels. Never center each
// revision separately: a fixed crop origin is what makes a small shift visible.
function Raster({ path, size = [780, 720], x, y, sx, sy, width, height, zoom }: {
  path: string; size?: number[]; x: number; y: number; sx: number; sy: number;
  width: number; height: number; zoom: number
}) {
  return <svg x={x} y={y} width={width} height={height}
    viewBox={`${sx} ${sy} ${width/zoom} ${height/zoom}`} overflow="hidden">
    <image href={'/eagle-evidence/'+path} width={size[0]} height={size[1]}
      style={{imageRendering: zoom > 1 ? 'pixelated' : 'auto'}}/>
  </svg>
}

function DeskProof({ subject, layout, time }: {subject: 'example-2' | 'example-3'; layout: SceneLayout; time: number}) {
  const compact = layout !== 'wide'
  const square = layout === 'square'
  const nav = subject === 'example-2'
  const arrived = time >= 2100 && time < 10000
  const repaired = time >= 5300 && time < 10000
  const guides = reveal(time,1000,1700) * (1-reveal(time,9400,10100))
  const route = nav ? (repaired ? 'fixed-notes' : arrived ? 'notes' : 'library')
    : (repaired ? 'type-retest' : 'fixed-notes')
  const file = 'desk/' + route + '.png'
  const {width: w, height: h} = sceneSize(layout)
  const panel = compact ? 0 : 348, top = square ? 168 : (compact ? 156 : 0)
  const x = panel + 16, boxY = top + (compact ? 47 : 56)
  const boxW = w - x - 16, boxH = compact ? 133 : 154
  const contextX = square ? (w - 390) / 2 : 0
  const contextY = square ? 42 : 36, sourceY = compact ? (nav ? 100 : 192) : 0
  const title = nav ? 'Navigation inset' : 'Opening pair'
  const phase = repaired ? 'Retest' : nav && !arrived ? 'Reference' : 'Original'
  const sample = desk.pair[repaired ? 'type-retest' : 'fixed-notes']
  const navPos = nav && arrived && !repaired ? desk.nav.notes : desk.nav.library
  const shotX = x+74, shotZoom = 1.45, sourceX = 32
  const rail = shotX + (desk.nav.library*2-sourceX)*shotZoom
  const row1 = boxY + (compact ? 10 : 18), row2 = row1+64
  const pairZoom = compact ? 1.36 : 1.52, pairSourceX = 48
  const pairX = x + (boxW-177)/2, pairY = boxY+16, pairSourceY = 245
  const readoutY = top + (compact ? 218 : 258)
  const amount = nav ? navPos-desk.nav.library : sample.gap
  const result = nav && !arrived ? desk.nav.library + ' px' : (nav && amount ? '+' : '') + amount + ' px'
  const caption = nav ? (repaired ? 'No shift on Notes' : arrived ? 'Shift on Notes' : 'Library reference')
    : (repaired ? 'Native pair spacing' : 'Gap between P and a')
  const shownValues = nav ? [desk.nav.library+' px', '+'+(desk.nav.notes-desk.nav.library)+' px', '0 px']
    : Object.values(desk.pair).map(pair=>pair.gap+' px')
  const strip = (path: string, y: number) => <Raster path={path} x={shotX} y={y} sx={sourceX} sy={128}
    width={Math.min(boxW-83, 180*shotZoom)} height={48} zoom={shotZoom}/>
  return <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={title} style={{display:'block',fontFamily:annotationFont}}>
    <rect width={w} height={h} fill={paper}/>
    <text x="15" y="24" fontSize="13" fontWeight="700" fill="#303030">{nav ? 'Example 2' : 'Example 3'}</text>
    <text x={compact?w-15:333} y="24" textAnchor="end" fontSize="13" fill="#303030">390 CSS px · 2×</text>
    <Raster path={file} x={contextX} y={contextY} sx={0} sy={sourceY} width={square ? 390 : (compact?w:panel)} height={compact?120:h-contextY} zoom={0.5}/>
    {nav && <path d={`M ${contextX+24} ${contextY + 52 - sourceY/2} v 43`} stroke={guide} strokeWidth="1.1" opacity={guides}/>}
    <rect x={panel} y={top} width={w-panel} height={h-top} fill={surface}/>
    <text x={x} y={top+(compact?31:37)} fontSize={compact?22:26} fill={ink}>{title}</text>
    {['Reference','Original','Retest'].map(label=><text key={label} x={w-17} y={top+(compact?29:35)} fill="#555555" fontSize="14"
      textAnchor="end" opacity={phase===label?1:0}>{label}</text>)}
    <rect x={x} y={boxY} width={boxW} height={boxH} fill={paper}/>
    {nav ? <>
      <text x={x+11} y={row1+28} fontSize="14" fill="#414141">Library</text>
      {strip('desk/library.png',row1)}
      <g opacity={arrived?1:0}>
        <text x={x+11} y={row2+28} fontSize="14" fill="#414141">Notes</text>
        {strip(file,row2)}
      </g>
      <path d={`M ${rail} ${row1+2} v ${(row2-row1+42)*guides}`} stroke={guide} strokeWidth="1.4" opacity={guides}/>
      <path d={`M ${rail + (navPos-desk.nav.library)*2*shotZoom} ${row2+2} v 40`}
        stroke={measuredInk} strokeWidth="1.4" strokeDasharray="3 2" opacity={arrived && !repaired ? guides : 0}/>
    </> : <>
      <Raster path={file} x={pairX} y={pairY} sx={pairSourceX} sy={pairSourceY}
        width={(sample.pairEnd*2-pairSourceX)*pairZoom} height={79*pairZoom} zoom={pairZoom}/>
      {Object.entries(desk.pair).map(([id,pair])=>{
        const left = pairX + (pair.left*2-pairSourceX)*pairZoom
        const right = pairX + (pair.right*2-pairSourceX)*pairZoom
        const wanted = id === (repaired ? 'type-retest' : 'fixed-notes')
        const swap = 1-reveal(time,5050,5290)+reveal(time,5310,5570)
        return <g key={id} opacity={wanted ? guides*swap : 0} stroke={guide} fill="none">
          <path d={`M ${left} ${pairY+2} v ${72*pairZoom} M ${right} ${pairY+2} v ${72*pairZoom}`} strokeDasharray="3 3"/>
          <path d={`M ${left} ${pairY+2} v -6 h ${right-left} v 6`} strokeWidth="1.6"/>
        </g>
      })}
    </>}
    <g fill={ink} fontSize={compact?32:37} fontWeight="700">
      {shownValues.map(value=><text key={value} x={x} y={readoutY}
        opacity={result===value?1:0}>{value}</text>)}
    </g>
    {(nav ? ['Library reference','Shift on Notes','No shift on Notes'] : ['Gap between P and a','Native pair spacing']).map(label=>
      <text key={label} x={x+(compact?102:110)} y={readoutY-2} fontSize={compact?16:17} fill={ink} opacity={label===caption?1:0}>{label}</text>)}
  </svg>
}

function HeadlineProof({ layout, time }: {layout: SceneLayout; time: number}) {
  const compact = layout !== 'wide'
  const square = layout === 'square'
  const profile = layout === 'compact' ? 'phone' : 'desktop'
  const proof = headline[profile]
  const stage = time >= 5300 && time < 10000 ? 'shipped' : time >= 2300 && time < 10000 ? 'tracking' : 'original'
  const number = {original:1,tracking:2,shipped:3}[stage]
  const path = `example-1/${profile}/stage-${number}.png`
  const phases = {original:'Original',tracking:'Tracking only',shipped:'Shipped'}
  const {width: w, height: h} = sceneSize(layout)
  const bg='#f36450', panelTop=compact?115:136
  const fullZoom=square ? (w-32)/proof.size[0] : 1/proof.dpr, fullW=proof.size[0]*fullZoom
  const zoom=compact?1.48:1.62, crop=proof.word
  const cropLeft = crop.x - 6, detailW=(crop.width+12)*zoom, detailH=crop.height*zoom
  const detailX=compact?(w-detailW)/2:24, detailY=panelTop+(compact?44:11)
  const draw = reveal(time,700,1400)*(1-reveal(time,9450,9950))
  const betweenCaptures = (1-reveal(time,2100,2290)+reveal(time,2310,2540))
    * (1-reveal(time,5050,5290)+reveal(time,5310,5570))
  const point = (v:number,origin:number,offset:number) => offset+(v+0.5-origin)*zoom
  const statX=compact?18:369, statY=square?367:(compact?344:247)
  return <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label="Headline with measured apostrophe–v ink distance"
    style={{display:'block',fontFamily:annotationFont}}>
    <rect width={w} height={h} fill={surface}/>
    <rect width={w} height={panelTop} fill="#ffffff"/>
    <g data-source-color=""><Raster path={path} size={proof.size} x={(w-fullW)/2} y={compact?44:35} sx={0} sy={0}
      width={fullW} height={proof.size[1]*fullZoom} zoom={fullZoom}/></g>
    <text x="15" y="22" fontSize="13" fill="#222222" fontWeight="700">Example 1</text>
    <text x={w-15} y="22" textAnchor="end" fill="#222222" fontSize="13">{proof.width} CSS px · {proof.dpr}×</text>
    {compact && <text x="18" y={panelTop+29} fontSize="19" fill={ink}>Apostrophe–v spacing</text>}
    <rect data-source-color="" x={detailX} y={detailY} width={detailW} height={detailH} fill={bg}/>
    {(Object.keys(phases) as Array<keyof typeof phases>).map((id,i)=>{
      const specimen = proof.stages[id]
      const [start,end] = specimen.wordColumns
      const [[ax,ay],[bx,by]] = specimen.points
      const x1=point(ax,cropLeft,detailX), x2=point(bx,cropLeft,detailX)
      const y1=point(ay,crop.y,detailY), y2=point(by,crop.y,detailY)
      return <g key={id} opacity={stage===id?1:0}>
        <Raster path={`example-1/${profile}/stage-${i+1}.png`} size={proof.size}
          x={detailX+(start-cropLeft)*zoom} y={detailY} sx={start} sy={crop.y}
          width={(end-start)*zoom} height={detailH} zoom={zoom}/>
        <g opacity={draw*betweenCaptures} stroke="#ffffff">
          <path d={`M ${x1} ${y1} L ${x2} ${y2}`} strokeWidth="2.2"/>
          {[[x1,y1],[x2,y2]].map(([cx,cy],j)=><circle key={j} cx={cx} cy={cy} r="2.7" strokeWidth="1.2" fill={ink}/>)}
        </g>
      </g>
    })}
    {!compact && <text x={statX} y={panelTop+35} fontSize="24" fill={ink}>Apostrophe–v spacing</text>}
    {(Object.keys(phases) as Array<keyof typeof phases>).map(id=><g key={id} opacity={id===stage?1:0}>
      <text x={statX} y={statY-39} fontSize="14" fill="#555555">{phases[id]}</text>
      <text x={statX} y={statY} fontSize={compact?35:37} fontWeight="700" fill={ink}>{proof.stages[id].distance.toFixed(2)} px</text>
    </g>)}
    <text x={statX} y={statY+24} fontSize="16" fill={ink}>Nearest ink between ’ and v</text>
  </svg>
}

export function ProofScene(props: {subject: Proof; layout: SceneLayout; time: number}) {
  return props.subject === 'example-1' ? <HeadlineProof {...props}/> : <DeskProof {...props} subject={props.subject}/>
}
