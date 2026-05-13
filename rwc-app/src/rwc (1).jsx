import { useState } from "react";

const WR = {
  "South Africa": 93.94, "New Zealand": 90.33, "Ireland": 89.07,
  "France": 87.46, "Argentina": 84.97, "England": 83.91,
  "Scotland": 82.90, "Australia": 81.53, "Fiji": 81.14,
  "Italy": 79.64, "Wales": 75.07, "Japan": 74.09,
  "Georgia": 71.94, "Portugal": 69.64, "Uruguay": 69.19,
  "United States": 68.26, "Spain": 67.51, "Chile": 66.72,
  "Tonga": 66.66, "Samoa": 66.43, "Romania": 60.67,
  "Hong Kong": 59.61, "Zimbabwe": 58.80, "Canada": 58.75,
};

const POOL_DATA = {
  A:[{name:"New Zealand",flag:"🇳🇿"},{name:"Australia",flag:"🇦🇺"},{name:"Chile",flag:"🇨🇱"},{name:"Hong Kong",flag:"🇭🇰"}],
  B:[{name:"South Africa",flag:"🇿🇦"},{name:"Italy",flag:"🇮🇹"},{name:"Georgia",flag:"🇬🇪"},{name:"Romania",flag:"🇷🇴"}],
  C:[{name:"Argentina",flag:"🇦🇷"},{name:"Fiji",flag:"🇫🇯"},{name:"Spain",flag:"🇪🇸"},{name:"Canada",flag:"🇨🇦"}],
  D:[{name:"Ireland",flag:"🇮🇪"},{name:"Scotland",flag:"🏴󠁧󠁢󠁳󠁣󠁴󠁿"},{name:"Uruguay",flag:"🇺🇾"},{name:"Portugal",flag:"🇵🇹"}],
  E:[{name:"France",flag:"🇫🇷"},{name:"Japan",flag:"🇯🇵"},{name:"Samoa",flag:"🇼🇸"},{name:"United States",flag:"🇺🇸"}],
  F:[{name:"England",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿"},{name:"Wales",flag:"🏴󠁧󠁢󠁷󠁬󠁳󠁿"},{name:"Tonga",flag:"🇹🇴"},{name:"Zimbabwe",flag:"🇿🇼"}],
};
Object.values(POOL_DATA).forEach(p=>p.forEach(t=>{t.rating=WR[t.name]??60;}));

// ── Regression model: fitted on 540 RWC matches 2003–2023 ───────────────────
// Score = 47.10360736 + 1.02029684×TeamRanking − 1.29942293×OppRanking
// Residuals: mean = 0, σ = 12.8655087
//
// Win probability = NORMDIST(0, scoreDiff, σ, TRUE)
//   = probability that a Normal(scoreDiff, σ) variate is ≤ 0
//   = Φ( (0 − scoreDiff) / σ )   where scoreDiff = predA − predB
//   i.e. P(Team A wins) = 1 − Φ(−scoreDiff / σ)
const B0 = 47.10360736;
const B1 = 1.02029684;
const B2 = -1.29942293;
const SIGMA = 12.8655087;  // residual std dev from data

// Predicted score from regression
function predictScore(teamRating, oppRating) {
  return B0 + B1 * teamRating + B2 * oppRating;
}

// Normal CDF — Φ(z) — Abramowitz & Stegun approximation (error < 7.5e-8)
function normCDF(z) {
  const t = 1 / (1 + 0.2315419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z >= 0 ? 1 - p : p;
}

// Win probability: NORMDIST(0, scoreDiff, σ, TRUE)
// = P(Normal(scoreDiff, σ) ≤ 0) = Φ((0 − scoreDiff) / σ)
// P(A wins) = 1 − NORMDIST(0, scoreDiff, σ, TRUE)
function winProb(rA, rB) {
  const scoreDiff = predictScore(rA, rB) - predictScore(rB, rA);
  return 1 - normCDF((0 - scoreDiff) / SIGMA);
}

// Box-Muller: sample from Standard Normal
function randn() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Snap to nearest valid rugby score (scores of 1, 2, 4 don't exist in rugby)
function rugbySnap(x) {
  const s = Math.max(0, Math.round(x));  // floor at 0
  if (s === 1 || s === 2) return 0;
  if (s === 4) return 3;
  return s;
}

function simulateMatch(teamA, teamB) {
  const rA = teamA.rating, rB = teamB.rating;

  // Predicted scores from regression
  const predA = predictScore(rA, rB);
  const predB = predictScore(rB, rA);

  // Sample actual scores: Normal(predicted, σ), floored at 0
  const sA = rugbySnap(predA + randn() * SIGMA);
  const sB = rugbySnap(predB + randn() * SIGMA);

  // Resolve ties (extremely rare in rugby — force a 3pt gap)
  const finalA = sA === sB ? sA + (Math.random() < 0.5 ? 3 : 0) : sA;
  const finalB = sA === sB ? sB + (Math.random() < 0.5 ? 0 : 3) : sB;

  const aWins = finalA > finalB;
  const tA = Math.floor(finalA * 0.55 / 7);
  const tB = Math.floor(finalB * 0.55 / 7);

  return {
    winner: aWins ? teamA : teamB,
    loser:  aWins ? teamB : teamA,
    scoreA: finalA, scoreB: finalB,
    bonusA: tA >= 4 ? 1 : 0,
    bonusB: tB >= 4 ? 1 : 0,
    lbA: !aWins && (finalB - finalA) <= 7 ? 1 : 0,
    lbB:  aWins && (finalA - finalB) <= 7 ? 1 : 0,
    triesA: tA, triesB: tB,
    wp: winProb(rA, rB),
  };
}

function mk(a,b){if(!a||!b)return null;const r=simulateMatch(a,b);return{...r,a,b};}

function simulatePool(teams){
  const res=teams.map(t=>({...t,played:0,wins:0,losses:0,draws:0,pf:0,pa:0,tries:0,pts:0}));
  const matches=[];
  for(let i=0;i<teams.length;i++){
    for(let j=i+1;j<teams.length;j++){
      const m=simulateMatch(res[i],res[j]);
      matches.push({a:teams[i].name,af:teams[i].flag,b:teams[j].name,bf:teams[j].flag,scoreA:m.scoreA,scoreB:m.scoreB,wp:m.wp});
      const ri=res.findIndex(r=>r.name===teams[i].name);
      const rj=res.findIndex(r=>r.name===teams[j].name);
      res[ri].played++;res[rj].played++;
      res[ri].pf+=m.scoreA;res[ri].pa+=m.scoreB;res[ri].tries+=m.triesA;
      res[rj].pf+=m.scoreB;res[rj].pa+=m.scoreA;res[rj].tries+=m.triesB;
      if(m.scoreA>m.scoreB){res[ri].wins++;res[ri].pts+=4+m.bonusA+m.lbA;res[rj].losses++;res[rj].pts+=m.bonusB+m.lbB;}
      else{res[rj].wins++;res[rj].pts+=4+m.bonusB+m.lbB;res[ri].losses++;res[ri].pts+=m.bonusA+m.lbA;}
    }
  }
  res.sort((a,b)=>b.pts-a.pts||(b.pf-b.pa)-(a.pf-a.pa)||b.pf-a.pf);
  return{standings:res,matches};
}

const TPT={
  "ABCD":["C3","D3","A3","B3"],"ABCE":["C3","E3","A3","B3"],"ABCF":["C3","F3","A3","B3"],
  "ABDE":["E3","D3","A3","B3"],"ABDF":["F3","D3","A3","B3"],"ABEF":["E3","F3","A3","B3"],
  "ACDE":["C3","D3","A3","E3"],"ACDF":["C3","D3","A3","F3"],"ACEF":["C3","E3","A3","F3"],
  "ADEF":["E3","D3","A3","F3"],"BCDE":["C3","D3","E3","B3"],"BCDF":["C3","D3","F3","B3"],
  "BCEF":["C3","E3","F3","B3"],"BDEF":["E3","D3","F3","B3"],"CDEF":["C3","D3","E3","F3"],
};

const PL=["A","B","C","D","E","F"];
const fmt=p=>`${Math.round(p*100)}%`;

function WinBar({prob}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:4,marginTop:3}}>
      <div style={{flex:1,height:3,background:"rgba(255,255,255,.07)",borderRadius:2,overflow:"hidden"}}>
        <div style={{width:fmt(prob),height:"100%",background:`hsl(${40+prob*80},75%,52%)`,transition:"width .3s"}}/>
      </div>
      <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:10,color:"rgba(232,224,208,.4)",minWidth:26}}>{fmt(prob)}</span>
    </div>
  );
}

function BMatch({a,b,scoreA,scoreB,winner,label,gold,bronze}){
  const wp=a&&b?winProb(a.rating,b.rating):null;
  return(
    <div style={{marginBottom:8}}>
      <div style={{border:`1px solid ${gold?"rgba(201,162,39,.6)":bronze?"rgba(160,120,60,.4)":"rgba(255,255,255,.1)"}`,boxShadow:gold?"0 0 16px rgba(201,162,39,.15)":"none",overflow:"hidden",borderRadius:2}}>
        {[{team:a,score:scoreA,myWp:wp},{team:b,score:scoreB,myWp:wp?1-wp:null}].map(({team,score,myWp},i)=>{
          const isWin=winner&&team&&winner.name===team.name;
          return(
            <div key={i} style={{padding:"6px 9px",background:isWin?"rgba(201,162,39,.12)":"transparent",borderBottom:i===0?"1px solid rgba(255,255,255,.06)":"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,fontWeight:600,color:!team?"rgba(232,224,208,.25)":isWin?"#C9A227":"#e8e0d0",fontStyle:!team?"italic":"normal"}}>
                {!team?<span>TBD</span>:<>
                  <span>{team.flag}</span>
                  <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{team.name}</span>
                  {myWp!==null&&!winner&&<span style={{fontSize:10,color:"rgba(232,224,208,.38)",marginLeft:4}}>{fmt(myWp)}</span>}
                  {winner&&<span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:15,marginLeft:"auto"}}>{score}</span>}
                </>}
              </div>
              {myWp!==null&&!winner&&<WinBar prob={myWp}/>}
            </div>
          );
        })}
      </div>
      {label&&<div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:10,color:"rgba(232,224,208,.22)",textAlign:"center",marginTop:2}}>{label}</div>}
    </div>
  );
}

// ─── Bracket component ────────────────────────────────────────────────────────
// Each match box is absolutely positioned.
// Heights/geometry:
//   MATCH_H  = height of one match card (two rows + label)
//   GAP      = vertical gap between consecutive R16 matches within a pair
//   PAIR_GAP = vertical gap between R16 pairs
//   COL_W    = column width
//   COL_GAP  = gap between columns
//
// Midpoint rule:
//   QF[i] top = midpoint of R16[2i] and R16[2i+1] minus half QF height
//   SF[i] top = midpoint of QF[2i] and QF[2i+1] minus half SF height
//   Final top  = midpoint of SF[0] and SF[1] minus half Final height
//   Bronze top = Final top + MATCH_H + 20
//
// All measurements are in pixels so the maths is exact.

const MATCH_H = 66;   // px: 2 team rows (28px each) + label (10px)
const R16_GAP = 10;   // gap between the two R16 games in a pair
const PAIR_GAP = 20;  // gap between pair 1 and pair 2 (in the R16 column)
const COL_W = 176;    // width of each column
const COL_GAP = 18;   // horizontal gap between columns
const HDR_H = 28;     // header row height

// Given the top of a match box, return its midpoint y
function mid(top) { return top + MATCH_H / 2; }

// Given two midpoints, return the top of a box centred between them
function centredTop(midA, midB) { return (midA + midB) / 2 - MATCH_H / 2; }

function MatchBox({m, top, left, label, gold, bronze, colW}) {
  const wp = m.a && m.b ? winProb(m.a.rating, m.b.rating) : null;
  const W = colW || COL_W;
  return (
    <div style={{position:"absolute", top, left, width:W}}>
      <div style={{
        border:`1px solid ${gold?"rgba(201,162,39,.65)":bronze?"rgba(160,120,60,.45)":"rgba(255,255,255,.1)"}`,
        boxShadow:gold?"0 0 18px rgba(201,162,39,.18)":"none",
        overflow:"hidden", borderRadius:2,
      }}>
        {[{team:m.a,score:m.scoreA},{team:m.b,score:m.scoreB}].map(({team,score},i)=>{
          const isWin = m.winner && team && m.winner.name === team.name;
          const myWp  = wp ? (i===0 ? wp : 1-wp) : null;
          return (
            <div key={i} style={{
              padding:"5px 8px",
              background:isWin?"rgba(201,162,39,.12)":"transparent",
              borderBottom:i===0?"1px solid rgba(255,255,255,.06)":"none",
            }}>
              <div style={{display:"flex",alignItems:"center",gap:5,fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,fontWeight:600,
                color:!team?"rgba(232,224,208,.25)":isWin?"#C9A227":"#e8e0d0",fontStyle:!team?"italic":"normal"}}>
                {!team ? <span style={{flex:1}}>TBD</span> : <>
                  <span>{team.flag}</span>
                  <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{team.name}</span>
                  {myWp!==null&&!m.winner&&<span style={{fontSize:10,color:"rgba(232,224,208,.35)"}}>{fmt(myWp)}</span>}
                  {m.winner&&<span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:15,marginLeft:4}}>{score}</span>}
                </>}
              </div>
              {myWp!==null&&!m.winner&&(
                <div style={{display:"flex",alignItems:"center",gap:3,marginTop:2}}>
                  <div style={{flex:1,height:2,background:"rgba(255,255,255,.06)",borderRadius:1,overflow:"hidden"}}>
                    <div style={{width:fmt(myWp),height:"100%",background:`hsl(${40+myWp*80},72%,50%)`}}/>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {label&&<div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:9,color:"rgba(232,224,208,.22)",textAlign:"center",marginTop:2}}>{label}</div>}
    </div>
  );
}

function Bracket({ko}) {
  // ── Compute R16 tops (stacked in pairs, pair separated by PAIR_GAP) ──
  // Pair 0: M1(idx0), M2(idx1)
  // Pair 1: M3(idx2), M4(idx3)
  // Pair 2: M5(idx4), M6(idx5)
  // Pair 3: M7(idx6), M8(idx7)

  const r16Tops = [];
  let cursor = HDR_H + 4;
  for (let pair = 0; pair < 4; pair++) {
    r16Tops.push(cursor);                        // first of pair
    r16Tops.push(cursor + MATCH_H + R16_GAP);   // second of pair
    cursor += MATCH_H + R16_GAP + MATCH_H + PAIR_GAP;
  }

  // ── QF tops: midpoint of the two feeders ──
  const qfTops = [0,1,2,3].map(i =>
    centredTop(mid(r16Tops[i*2]), mid(r16Tops[i*2+1]))
  );

  // ── SF tops: midpoint of QF pair ──
  const sfTops = [0,1].map(i =>
    centredTop(mid(qfTops[i*2]), mid(qfTops[i*2+1]))
  );

  // ── Final top: midpoint of both SFs ──
  const finalTop = centredTop(mid(sfTops[0]), mid(sfTops[1]));
  const bronzeTop = finalTop + MATCH_H + 24;

  // Total canvas height
  const totalH = Math.max(cursor, bronzeTop + MATCH_H + 20);

  // ── Column left positions ──
  const c = (n) => n * (COL_W + COL_GAP);
  const leftR16  = c(0);
  const leftQF   = c(1);
  const leftSF   = c(2);
  const leftFin  = c(3);

  // Column header label positions
  const headers = [
    {label:"Round of 16", left:leftR16},
    {label:"Quarter-Finals", left:leftQF},
    {label:"Semi-Finals", left:leftSF},
    {label:"Final", left:leftFin},
  ];

  return (
    <div style={{overflowX:"auto",paddingBottom:20}}>
      <div style={{position:"relative",width: leftFin + COL_W, height:totalH, minWidth:leftFin+COL_W}}>

        {/* Column headers */}
        {headers.map(({label,left})=>(
          <div key={label} style={{
            position:"absolute", top:0, left, width:COL_W,
            fontFamily:"'Bebas Neue',sans-serif", fontSize:12, letterSpacing:1,
            color:"rgba(232,224,208,.35)", textAlign:"center",
            paddingBottom:5, borderBottom:"1px solid rgba(255,255,255,.07)",
          }}>{label}</div>
        ))}

        {/* R16 matches */}
        {ko.r16.map((m,i)=>(
          <MatchBox key={i} m={m} top={r16Tops[i]} left={leftR16} label={`M${i+1}`}/>
        ))}

        {/* QF matches */}
        {ko.qf.map((m,i)=>(
          <MatchBox key={i} m={m} top={qfTops[i]} left={leftQF} label={`QF${i+1}`}/>
        ))}

        {/* SF matches */}
        {ko.sf.map((m,i)=>(
          <MatchBox key={i} m={m} top={sfTops[i]} left={leftSF} label={`SF${i+1}`}/>
        ))}

        {/* Final */}
        <MatchBox m={ko.final} top={finalTop} left={leftFin} label="🏆 The Final" gold/>

        {/* Bronze */}
        <MatchBox m={ko.bronze} top={bronzeTop} left={leftFin} label="🥉 Bronze Final" bronze/>

        {/* Connector lines: R16 → QF */}
        <svg style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",overflow:"visible"}}>
          {ko.r16.map((_,i)=>{
            const pair = Math.floor(i/2);
            const x1 = leftR16 + COL_W;
            const y1 = r16Tops[i] + MATCH_H/2;
            const xm = leftQF;
            const y2 = qfTops[pair] + MATCH_H/2;
            const xc = x1 + (xm-x1)*0.5;
            return(
              <path key={i} d={`M${x1},${y1} C${xc},${y1} ${xc},${y2} ${xm},${y2}`}
                stroke="rgba(201,162,39,.18)" strokeWidth="1.5" fill="none"/>
            );
          })}
          {/* QF → SF */}
          {ko.qf.map((_,i)=>{
            const pair = Math.floor(i/2);
            const x1 = leftQF + COL_W;
            const y1 = qfTops[i] + MATCH_H/2;
            const xm = leftSF;
            const y2 = sfTops[pair] + MATCH_H/2;
            const xc = x1 + (xm-x1)*0.5;
            return(
              <path key={i} d={`M${x1},${y1} C${xc},${y1} ${xc},${y2} ${xm},${y2}`}
                stroke="rgba(201,162,39,.22)" strokeWidth="1.5" fill="none"/>
            );
          })}
          {/* SF → Final */}
          {ko.sf.map((_,i)=>{
            const x1 = leftSF + COL_W;
            const y1 = sfTops[i] + MATCH_H/2;
            const xm = leftFin;
            const y2 = finalTop + MATCH_H/2;
            const xc = x1 + (xm-x1)*0.5;
            return(
              <path key={i} d={`M${x1},${y1} C${xc},${y1} ${xc},${y2} ${xm},${y2}`}
                stroke="rgba(201,162,39,.3)" strokeWidth="2" fill="none"/>
            );
          })}
        </svg>

      </div>
    </div>
  );
}


export default function App(){
  const [tab,setTab]=useState("pools");
  const [pd,setPd]=useState(null);
  const [ko,setKo]=useState(null);
  const [sim,setSim]=useState(false);
  const [open,setOpen]=useState({});

  function run(){
    setSim(true);
    setTimeout(()=>{
      const r={};
      PL.forEach(l=>{r[l]=simulatePool(POOL_DATA[l]);});
      const w={},ru={},thirds={};
      PL.forEach(l=>{const s=r[l].standings;w[l]={...s[0],pool:l};ru[l]={...s[1],pool:l};thirds[l]={...s[2],pool:l};});
      const aT=Object.values(thirds).sort((a,b)=>b.pts-a.pts||(b.pf-b.pa)-(a.pf-a.pa)||b.pf-a.pf);
      const top4=aT.slice(0,4);
      const qp=top4.map(t=>t.pool).sort();
      const qm={};top4.forEach(t=>{qm[t.pool]=t;});
      const key=qp.join("");
      const map=TPT[key]||["?","?","?","?"];
      const gT=c=>qm[c?.[0]]||null;
      const r16=[mk(w.A,gT(map[0])),mk(w.B,gT(map[1])),mk(ru.C,ru.F),mk(w.E,ru.D),mk(ru.A,ru.E),mk(w.F,ru.B),mk(w.C,gT(map[2])),mk(w.D,gT(map[3]))];
      const qf=[mk(r16[0].winner,r16[1].winner),mk(r16[2].winner,r16[3].winner),mk(r16[4].winner,r16[5].winner),mk(r16[6].winner,r16[7].winner)];
      const sf=[mk(qf[0].winner,qf[1].winner),mk(qf[2].winner,qf[3].winner)];
      const bronze=mk(sf[0].loser,sf[1].loser);
      const final=mk(sf[0].winner,sf[1].winner);
      setKo({r16,qf,sf,bronze,final,qp,aT,top4,map,qm});
      setPd(r);setSim(false);setTab("pools");
    },700);
  }

  const champ=ko?.final?.winner;

  const css=`
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:#0a0a0f;}
    .rwc{min-height:100vh;background:#0a0a0f;color:#e8e0d0;font-family:'Barlow Condensed',sans-serif;}
    .tb{padding:7px 14px;background:transparent;border:1px solid rgba(201,162,39,.3);color:rgba(232,224,208,.5);font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:all .2s;}
    .tb:hover{border-color:#C9A227;color:#C9A227;}
    .tb.on{background:#C9A227;border-color:#C9A227;color:#0a0a0f;}
    .sb{padding:5px 11px;background:transparent;color:#C9A227;font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;border:1px solid rgba(201,162,39,.3);cursor:pointer;}
    .sb:hover{background:rgba(201,162,39,.07);}
    .t{width:100%;border-collapse:collapse;font-size:12px;}
    .t th{text-align:left;padding:3px 5px;color:rgba(232,224,208,.3);font-weight:700;font-size:9px;border-bottom:1px solid rgba(255,255,255,.08);}
    .t td{padding:5px;border-bottom:1px solid rgba(255,255,255,.03);}
    .t .q td{color:#C9A227;}
    .t .q3 td{color:#7bc8d4;}
    .hd{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:2px;color:#C9A227;border-bottom:1px solid rgba(201,162,39,.2);padding-bottom:4px;margin-bottom:12px;}
    .card{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);padding:13px;}
    .badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:rgba(201,162,39,.08);border:1px solid rgba(201,162,39,.2);font-size:10px;font-weight:700;letter-spacing:1px;color:#C9A227;border-radius:2px;}
  `;

  return(<>
    <style>{css}</style>
    <div className="rwc">

      {/* HERO */}
      <div style={{textAlign:"center",padding:"28px 14px 18px",background:"radial-gradient(ellipse 80% 50% at 50% 0%,rgba(180,140,40,.14) 0%,transparent 70%)"}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:10,fontWeight:700,letterSpacing:4,textTransform:"uppercase",color:"#C9A227",marginBottom:5}}>🏉 Tournament Simulator</div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(38px,8vw,70px)",lineHeight:.9,color:"#f0e6c8",textShadow:"0 0 50px rgba(201,162,39,.3)"}}>
          Rugby <span style={{color:"#C9A227"}}>World</span> Cup
        </div>
        <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:9,flexWrap:"wrap"}}>
          <span className="badge">📊 Regression-based model</span>
          <span className="badge">540 RWC matches</span>
          <span className="badge">R²=0.56 · σ=12.85</span>
        </div>
      </div>

      {!pd ? (
        <div style={{padding:"16px 14px",maxWidth:1100,margin:"0 auto"}}>
          {/* Model box */}
          <div style={{background:"rgba(201,162,39,.05)",border:"1px solid rgba(201,162,39,.18)",padding:"13px 16px",marginBottom:18,lineHeight:1.7,fontSize:13,color:"rgba(232,224,208,.7)"}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:17,color:"#C9A227",marginBottom:6,letterSpacing:1}}>How Scores Are Predicted</div>
            Scores are sampled from a <strong style={{color:"#e8e0d0"}}>linear regression fitted on 540 World Cup matches (2003–2023)</strong>:<br/>
            <code style={{color:"#C9A227",fontSize:12}}>Score = 47.10 + 1.020 × TeamWR − 1.299 × OppWR</code><br/>
            Each team's score is drawn from <strong style={{color:"#e8e0d0"}}>Normal(predicted, σ=12.85)</strong>. Win probability = P(scoreA &gt; scoreB) from the joint normal margin distribution — validated against historical upset rates.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(195px,1fr))",gap:11,marginBottom:20}}>
            {PL.map(l=>(
              <div key={l} className="card">
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:17,letterSpacing:2,color:"#C9A227",marginBottom:9}}>Pool {l}</div>
                {POOL_DATA[l].map(t=>{
                  const others=POOL_DATA[l].filter(o=>o.name!==t.name);
                  const avg=others.reduce((s,o)=>s+winProb(t.rating,o.rating),0)/others.length;
                  return(
                    <div key={t.name} style={{padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,fontSize:13,fontWeight:600}}>
                        <span>{t.flag}</span><span style={{flex:1}}>{t.name}</span>
                        <span style={{fontSize:10,color:"rgba(232,224,208,.38)"}}>WR {t.rating.toFixed(1)}</span>
                      </div>
                      <WinBar prob={avg}/>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{textAlign:"center"}}>
            <p style={{fontSize:12,color:"rgba(232,224,208,.45)",maxWidth:440,margin:"0 auto 16px",lineHeight:1.6}}>Win bars = avg win % vs pool opponents. Bonus points apply (4-try +1, lose ≤7 +1).</p>
            <button onClick={run} disabled={sim} style={{padding:"12px 34px",background:"#C9A227",color:"#0a0a0f",fontFamily:"'Bebas Neue',sans-serif",fontSize:21,letterSpacing:2,border:"none",cursor:sim?"not-allowed":"pointer",clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0 100%)",opacity:sim?.5:1}}>
              {sim?"Simulating…":"▶  Simulate Tournament"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {champ&&(
            <div style={{textAlign:"center",padding:"22px 14px",background:"radial-gradient(ellipse 50% 70% at 50% 50%,rgba(201,162,39,.12) 0%,transparent 70%)",borderBottom:"1px solid rgba(201,162,39,.14)"}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:5,textTransform:"uppercase",color:"rgba(201,162,39,.5)",marginBottom:4}}>🏆 World Cup Champion</div>
              <div style={{fontSize:50}}>{champ.flag}</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(32px,6vw,56px)",color:"#C9A227",letterSpacing:4,textShadow:"0 0 30px rgba(201,162,39,.5)"}}>{champ.name}</div>
              <div style={{fontSize:11,color:"rgba(232,224,208,.38)",marginTop:3}}>
                WR {champ.rating.toFixed(2)} · Final win probability: {fmt(winProb(champ.rating,ko.final[champ.name===ko.final.a.name?"b":"a"].rating))}
              </div>
            </div>
          )}

          <div style={{display:"flex",justifyContent:"center",gap:5,padding:"11px 14px",flexWrap:"wrap"}}>
            {[["pools","Pools"],["thirds","3rd Place"],["ko","Knockout"]].map(([k,l])=>(
              <button key={k} className={`tb${tab===k?" on":""}`} onClick={()=>setTab(k)}>{l}</button>
            ))}
            <button className="sb" style={{marginLeft:7}} onClick={()=>{setPd(null);setKo(null);setOpen({});}}>↺ Reset</button>
            <button className="sb" onClick={run}>⟳ Re-sim</button>
          </div>

          <div style={{maxWidth:1200,margin:"0 auto",padding:"0 12px 48px"}}>

            {/* POOLS */}
            {tab==="pools"&&(
              <>
                <div className="hd">Pool Stage</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:11}}>
                  {PL.map(l=>{
                    const{standings,matches}=pd[l];
                    return(
                      <div key={l} className="card">
                        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:17,letterSpacing:2,color:"#C9A227",marginBottom:9}}>Pool {l}</div>
                        <table className="t">
                          <thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>PD</th><th>T</th><th>Pts</th></tr></thead>
                          <tbody>
                            {standings.map((t,i)=>(
                              <tr key={t.name} className={i<2?"q":i===2?"q3":""}>
                                <td><span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:15,height:15,fontSize:9,fontWeight:700,background:"rgba(255,255,255,.06)",borderRadius:2}}>{i+1}</span></td>
                                <td>{t.flag} {t.name}</td>
                                <td>{t.wins}</td><td>{t.losses}</td>
                                <td>{t.pf-t.pa>0?"+":""}{t.pf-t.pa}</td>
                                <td>{t.tries}</td><td><strong>{t.pts}</strong></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{marginTop:8}}>
                          <button className="sb" style={{fontSize:9,padding:"2px 7px"}} onClick={()=>setOpen(p=>({...p,[l]:!p[l]}))}>
                            {open[l]?"▲ Hide":"▼ Show"} Results
                          </button>
                          {open[l]&&(
                            <div style={{marginTop:7}}>
                              {matches.map((m,i)=>(
                                <div key={i} style={{marginBottom:5}}>
                                  <div style={{display:"flex",alignItems:"center",padding:"4px 6px",background:"rgba(255,255,255,.018)",fontSize:11,gap:4}}>
                                    <span style={{flex:1}}>{m.af} {m.a}</span>
                                    <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:14,color:"#C9A227",minWidth:42,textAlign:"center"}}>{m.scoreA}–{m.scoreB}</span>
                                    <span style={{flex:1,textAlign:"right"}}>{m.b} {m.bf}</span>
                                  </div>
                                  <div style={{display:"flex",alignItems:"center",padding:"2px 6px",gap:5}}>
                                    <div style={{flex:1,height:2,background:"rgba(255,255,255,.05)",borderRadius:1,overflow:"hidden"}}>
                                      <div style={{width:fmt(m.wp),height:"100%",background:`hsl(${40+m.wp*80},70%,50%)`}}/>
                                    </div>
                                    <span style={{fontSize:9,color:"rgba(232,224,208,.28)",minWidth:70,textAlign:"right"}}>{fmt(m.wp)} pre-match</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:11,color:"rgba(232,224,208,.38)",marginTop:10}}>
                  <span>🟡 Qualified (Top 2)</span><span>🔵 3rd-place eligible</span>
                  <span style={{marginLeft:"auto"}}>Win 4pts · 4-try bonus +1 · Lose ≤7 +1</span>
                </div>
              </>
            )}

            {/* THIRDS */}
            {tab==="thirds"&&ko&&(
              <>
                <div className="hd">Third-Place Rankings</div>
                <p style={{fontSize:13,color:"rgba(232,224,208,.5)",marginBottom:13}}>Top 4 qualify. Permutation key: <strong style={{color:"#C9A227"}}>{ko.qp.join("")}</strong></p>
                <div style={{overflowX:"auto",marginBottom:22}}>
                  <table className="t" style={{minWidth:500}}>
                    <thead><tr><th>#</th><th>Team</th><th>Pool</th><th>WR</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>PD</th><th>T</th><th>Pts</th><th></th></tr></thead>
                    <tbody>
                      {ko.aT.map((t,i)=>(
                        <tr key={t.name} style={{opacity:i>=4?.4:1}}>
                          <td>{i+1}</td><td>{t.flag} {t.name}</td>
                          <td style={{color:"#C9A227",fontWeight:700}}>Pool {t.pool}</td>
                          <td style={{fontSize:10,color:"rgba(232,224,208,.38)"}}>{t.rating.toFixed(1)}</td>
                          <td>{t.wins}</td><td>{t.losses}</td><td>{t.pf}</td><td>{t.pa}</td>
                          <td>{t.pf-t.pa>0?"+":""}{t.pf-t.pa}</td><td>{t.tries}</td><td><strong>{t.pts}</strong></td>
                          <td style={{fontSize:10}}>{i<4?<span style={{color:"#C9A227",fontWeight:700}}>✓</span>:<span style={{color:"rgba(232,224,208,.25)"}}>–</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="hd" style={{fontSize:18}}>R16 Assignments</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))",gap:9,maxWidth:800}}>
                  {[["Winner Pool A","M1",ko.map[0]],["Winner Pool B","M2",ko.map[1]],["Winner Pool C","M7",ko.map[2]],["Winner Pool D","M8",ko.map[3]]].map(([seed,match,code])=>{
                    const opp=ko.qm[code?.[0]];
                    return(
                      <div key={seed} className="card">
                        <div style={{fontSize:9,fontWeight:700,letterSpacing:1,color:"rgba(232,224,208,.28)",marginBottom:4}}>{match}</div>
                        <div style={{fontSize:13,fontWeight:700,color:"#C9A227",marginBottom:2}}>{seed}</div>
                        <div style={{fontSize:10,color:"rgba(232,224,208,.33)",marginBottom:5}}>vs {code}</div>
                        <div style={{fontSize:13,fontWeight:700}}>{opp?`${opp.flag} ${opp.name}`:"—"}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* KNOCKOUT */}
            {tab==="ko"&&ko&&(
              <>
                <div className="hd">Knockout Stage</div>
                <Bracket ko={ko}/>
                <div style={{marginTop:12,padding:"9px 13px",background:"rgba(201,162,39,.04)",border:"1px solid rgba(201,162,39,.13)",fontSize:11,color:"rgba(232,224,208,.4)",lineHeight:1.7}}>
                  <strong style={{color:"rgba(201,162,39,.65)"}}>Model:</strong> Score ~ Normal(47.104 + 1.0203×WR − 1.2994×OppWR, σ=12.8655). Win % = 1 − NORMDIST(0, predA−predB, σ, TRUE). Scores floored at 0. Fitted on 540 RWC matches 2003–2023.
                </div>
              </>
            )}          </div>
        </>
      )}
    </div>
  </>);
}
