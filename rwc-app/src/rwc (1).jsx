import { useState } from "react";

const FLAGS = {
  "New Zealand":"nz","Australia":"au","Chile":"cl","Hong Kong":"hk",
  "South Africa":"za","Italy":"it","Georgia":"ge","Romania":"ro",
  "Argentina":"ar","Fiji":"fj","Spain":"es","Canada":"ca",
  "Ireland":"ie","Scotland":"gb-sct","Uruguay":"uy","Portugal":"pt",
  "France":"fr","Japan":"jp","Samoa":"ws","United States":"us",
  "England":"gb-eng","Wales":"gb-wls","Tonga":"to","Zimbabwe":"zw",
};

function Flag({ code, size=16 }) {
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/w${size * 2}/${code}.png`}
      width={size} height={Math.round(size * 0.75)}
      alt={code}
      style={{ display:"inline-block", verticalAlign:"middle", borderRadius:1, flexShrink:0, objectFit:"cover" }}
    />
  );
}

const WR = {
  "South Africa":93.94,"New Zealand":90.33,"Ireland":89.07,"France":87.46,
  "Argentina":84.97,"England":83.91,"Scotland":82.90,"Australia":81.53,
  "Fiji":81.14,"Italy":79.64,"Wales":75.07,"Japan":74.09,"Georgia":71.94,
  "Portugal":69.64,"Uruguay":69.19,"United States":68.26,"Spain":67.51,
  "Chile":66.72,"Tonga":66.66,"Samoa":66.43,"Romania":60.67,
  "Hong Kong":59.61,"Zimbabwe":58.80,"Canada":58.75,
};

const POOLS_RAW = {
  A:[{name:"New Zealand"},{name:"Australia"},{name:"Chile"},{name:"Hong Kong"}],
  B:[{name:"South Africa"},{name:"Italy"},{name:"Georgia"},{name:"Romania"}],
  C:[{name:"Argentina"},{name:"Fiji"},{name:"Spain"},{name:"Canada"}],
  D:[{name:"Ireland"},{name:"Scotland"},{name:"Uruguay"},{name:"Portugal"}],
  E:[{name:"France"},{name:"Japan"},{name:"Samoa"},{name:"United States"}],
  F:[{name:"England"},{name:"Wales"},{name:"Tonga"},{name:"Zimbabwe"}],
};
Object.values(POOLS_RAW).forEach(pool =>
  pool.forEach(t => {
    t.rating = WR[t.name] ?? 60;
    t.fc = FLAGS[t.name] ?? "";
  })
);

// Regression: Score = 47.10360736 + 1.02029684*TeamWR - 1.29942293*OppWR, σ=12.8655087
const B0=47.10360736, B1=1.02029684, B2=-1.29942293, SIG=12.8655087;

function predScore(r, o) { return B0 + B1*r + B2*o; }

function normCDF(z) {
  const t = 1 / (1 + 0.2315419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const poly = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z >= 0 ? 1 - poly : poly;
}

function winPct(rA, rB) {
  const diff = predScore(rA, rB) - predScore(rB, rA);
  return 1 - normCDF(-diff / SIG);
}

function sampleNormal() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function snapScore(x) {
  const s = Math.max(0, Math.round(x));
  if (s === 1 || s === 2) return 0;
  if (s === 4) return 3;
  return s;
}

function simPoolMatch(A, B) {
  const sA = snapScore(predScore(A.rating, B.rating) + sampleNormal() * SIG);
  const sB = snapScore(predScore(B.rating, A.rating) + sampleNormal() * SIG);
  const isDraw = sA === sB;
  const tA = Math.floor(sA * 0.55 / 7);
  const tB = Math.floor(sB * 0.55 / 7);
  const bA = tA >= 4 ? 1 : 0;
  const bB = tB >= 4 ? 1 : 0;
  const lbA = !isDraw && sA < sB && (sB - sA) <= 7 ? 1 : 0;
  const lbB = !isDraw && sB < sA && (sA - sB) <= 7 ? 1 : 0;
  return { sA, sB, isDraw, winner: isDraw ? null : sA > sB ? A : B, bA, bB, lbA, lbB, tA, tB, wp: winPct(A.rating, B.rating) };
}

function simKOMatch(A, B) {
  let sA, sB;
  do {
    sA = snapScore(predScore(A.rating, B.rating) + sampleNormal() * SIG);
    sB = snapScore(predScore(B.rating, A.rating) + sampleNormal() * SIG);
  } while (sA === sB);
  const tA = Math.floor(sA * 0.55 / 7);
  const tB = Math.floor(sB * 0.55 / 7);
  const aWins = sA > sB;
  return {
    sA, sB, isDraw: false,
    winner: aWins ? A : B,
    loser: aWins ? B : A,
    bA: tA >= 4 ? 1 : 0, bB: tB >= 4 ? 1 : 0,
    lbA: !aWins && (sB - sA) <= 7 ? 1 : 0,
    lbB: aWins && (sA - sB) <= 7 ? 1 : 0,
    tA, tB, wp: winPct(A.rating, B.rating),
  };
}

function makeKO(a, b) {
  if (!a || !b) return null;
  const r = simKOMatch(a, b);
  return { ...r, a, b, scoreA: r.sA, scoreB: r.sB };
}

function simPool(teams) {
  const res = teams.map(t => ({ ...t, played:0, wins:0, draws:0, losses:0, pf:0, pa:0, tf:0, ta:0, bonus:0, pts:0 }));
  const matches = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const m = simPoolMatch(res[i], res[j]);
      matches.push({ a: teams[i].name, afC: teams[i].fc, b: teams[j].name, bfC: teams[j].fc, scoreA: m.sA, scoreB: m.sB, isDraw: m.isDraw, wp: m.wp });
      const ri = res.findIndex(r => r.name === teams[i].name);
      const rj = res.findIndex(r => r.name === teams[j].name);
      res[ri].played++; res[rj].played++;
      res[ri].pf += m.sA; res[ri].pa += m.sB; res[ri].tf += m.tA; res[ri].ta += m.tB;
      res[rj].pf += m.sB; res[rj].pa += m.sA; res[rj].tf += m.tB; res[rj].ta += m.tA;
      if (m.isDraw) {
        res[ri].draws++; res[ri].pts += 2 + m.bA; res[ri].bonus += m.bA;
        res[rj].draws++; res[rj].pts += 2 + m.bB; res[rj].bonus += m.bB;
      } else if (m.sA > m.sB) {
        res[ri].wins++; res[ri].pts += 4 + m.bA + m.lbA; res[ri].bonus += m.bA + m.lbA;
        res[rj].losses++; res[rj].pts += m.bB + m.lbB; res[rj].bonus += m.bB + m.lbB;
      } else {
        res[rj].wins++; res[rj].pts += 4 + m.bB + m.lbB; res[rj].bonus += m.bB + m.lbB;
        res[ri].losses++; res[ri].pts += m.bA + m.lbA; res[ri].bonus += m.bA + m.lbA;
      }
    }
  }
  res.sort((a, b) => b.pts - a.pts || (b.pf - b.pa) - (a.pf - a.pa) || b.pf - a.pf);
  return { standings: res, matches };
}

const TPT = {
  "ABCD":["C3","D3","A3","B3"],"ABCE":["C3","E3","A3","B3"],"ABCF":["C3","F3","A3","B3"],
  "ABDE":["E3","D3","A3","B3"],"ABDF":["F3","D3","A3","B3"],"ABEF":["E3","F3","A3","B3"],
  "ACDE":["C3","D3","A3","E3"],"ACDF":["C3","D3","A3","F3"],"ACEF":["C3","E3","A3","F3"],
  "ADEF":["E3","D3","A3","F3"],"BCDE":["C3","D3","E3","B3"],"BCDF":["C3","D3","F3","B3"],
  "BCEF":["C3","E3","F3","B3"],"BDEF":["E3","D3","F3","B3"],"CDEF":["C3","D3","E3","F3"],
};

const POOL_LETTERS = ["A","B","C","D","E","F"];
const fmtPct = prob => `${Math.round(prob * 100)}%`;

// ── Bracket geometry constants ────────────────────────────────────────────────
const MATCH_H = 62;
const R16_GAP = 8;
const PAIR_GAP = 20;
const COL_W = 178;
const COL_GAP = 18;
const HDR_H = 26;

function getMid(top) { return top + MATCH_H / 2; }
function getCentredTop(midA, midB) { return (midA + midB) / 2 - MATCH_H / 2; }

function WinBar({ prob }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:3 }}>
      <div style={{ flex:1, height:3, background:"rgba(255,255,255,.07)", borderRadius:2, overflow:"hidden" }}>
        <div style={{ width: fmtPct(prob), height:"100%", background:`hsl(${40 + prob*80},75%,52%)` }} />
      </div>
      <span style={{ fontSize:10, color:"rgba(232,224,208,.4)", minWidth:28 }}>{fmtPct(prob)}</span>
    </div>
  );
}

function MatchCard({ m, top, left, label, gold, bronze }) {
  const wProb = m.a && m.b ? winPct(m.a.rating, m.b.rating) : null;
  const borderColor = gold ? "rgba(201,162,39,.65)" : bronze ? "rgba(160,120,60,.45)" : "rgba(255,255,255,.1)";
  const rows = [
    { team: m.a, score: m.scoreA, myProb: wProb },
    { team: m.b, score: m.scoreB, myProb: wProb !== null ? 1 - wProb : null },
  ];
  return (
    <div style={{ position:"absolute", top, left, width:COL_W }}>
      <div style={{ border:`1px solid ${borderColor}`, boxShadow: gold ? "0 0 18px rgba(201,162,39,.18)" : "none", overflow:"hidden", borderRadius:2 }}>
        {rows.map(({ team, score, myProb }, idx) => {
          const isWinner = m.winner && team && m.winner.name === team.name;
          return (
            <div key={idx} style={{
              padding:"5px 8px",
              background: isWinner ? "rgba(201,162,39,.12)" : "transparent",
              borderBottom: idx === 0 ? "1px solid rgba(255,255,255,.06)" : "none",
            }}>
              <div style={{
                display:"flex", alignItems:"center", gap:5,
                fontSize:12, fontWeight:600, fontFamily:"'Barlow Condensed',sans-serif",
                color: !team ? "rgba(232,224,208,.25)" : isWinner ? "#C9A227" : "#e8e0d0",
                fontStyle: !team ? "italic" : "normal",
              }}>
                {!team ? (
                  <span style={{ flex:1 }}>TBD</span>
                ) : (
                  <>
                    <Flag code={team.fc} size={15} />
                    <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{team.name}</span>
                    {myProb !== null && !m.winner && <span style={{ fontSize:10, color:"rgba(232,224,208,.35)" }}>{fmtPct(myProb)}</span>}
                    {m.winner && <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:15, marginLeft:4 }}>{score}</span>}
                  </>
                )}
              </div>
              {myProb !== null && !m.winner && (
                <div style={{ height:2, background:"rgba(255,255,255,.06)", borderRadius:1, overflow:"hidden", marginTop:3 }}>
                  <div style={{ width: fmtPct(myProb), height:"100%", background:`hsl(${40 + myProb*80},72%,50%)` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {label && <div style={{ fontSize:9, color:"rgba(232,224,208,.22)", textAlign:"center", marginTop:2, fontFamily:"'Barlow Condensed',sans-serif" }}>{label}</div>}
    </div>
  );
}

function Bracket({ ko }) {
  // Compute R16 tops: 4 pairs, each pair has 2 matches
  const r16Tops = [];
  let cursor = HDR_H + 4;
  for (let pair = 0; pair < 4; pair++) {
    r16Tops.push(cursor);
    r16Tops.push(cursor + MATCH_H + R16_GAP);
    cursor += MATCH_H + R16_GAP + MATCH_H + PAIR_GAP;
  }

  // QF tops: centred between each pair of R16 matches
  const qfTops = [0,1,2,3].map(i => getCentredTop(getMid(r16Tops[i*2]), getMid(r16Tops[i*2+1])));

  // SF tops: centred between each pair of QF matches
  const sfTops = [0,1].map(i => getCentredTop(getMid(qfTops[i*2]), getMid(qfTops[i*2+1])));

  // Final top: centred between both SFs
  const finalTop = getCentredTop(getMid(sfTops[0]), getMid(sfTops[1]));
  const bronzeTop = finalTop + MATCH_H + 20;

  const totalH = Math.max(cursor + 10, bronzeTop + MATCH_H + 20);

  const leftR16 = 0;
  const leftQF  = COL_W + COL_GAP;
  const leftSF  = leftQF + COL_W + COL_GAP;
  const leftFin = leftSF + COL_W + COL_GAP;
  const totalW  = leftFin + COL_W;

  const headers = [
    { label:"Round of 16", left: leftR16 },
    { label:"Quarter-Finals", left: leftQF },
    { label:"Semi-Finals", left: leftSF },
    { label:"Final", left: leftFin },
  ];

  // SVG connector paths
  const connectors = [];
  ko.r16.forEach((_, i) => {
    const pairIdx = Math.floor(i / 2);
    const x1 = leftR16 + COL_W, y1 = r16Tops[i] + MATCH_H / 2;
    const x2 = leftQF, y2 = qfTops[pairIdx] + MATCH_H / 2;
    const xc = x1 + (x2 - x1) * 0.5;
    connectors.push({ d:`M${x1},${y1} C${xc},${y1} ${xc},${y2} ${x2},${y2}`, color:"rgba(201,162,39,.18)", width:1.5 });
  });
  ko.qf.forEach((_, i) => {
    const pairIdx = Math.floor(i / 2);
    const x1 = leftQF + COL_W, y1 = qfTops[i] + MATCH_H / 2;
    const x2 = leftSF, y2 = sfTops[pairIdx] + MATCH_H / 2;
    const xc = x1 + (x2 - x1) * 0.5;
    connectors.push({ d:`M${x1},${y1} C${xc},${y1} ${xc},${y2} ${x2},${y2}`, color:"rgba(201,162,39,.22)", width:1.5 });
  });
  ko.sf.forEach((_, i) => {
    const x1 = leftSF + COL_W, y1 = sfTops[i] + MATCH_H / 2;
    const x2 = leftFin, y2 = finalTop + MATCH_H / 2;
    const xc = x1 + (x2 - x1) * 0.5;
    connectors.push({ d:`M${x1},${y1} C${xc},${y1} ${xc},${y2} ${x2},${y2}`, color:"rgba(201,162,39,.3)", width:2 });
  });

  return (
    <div style={{ overflowX:"auto", paddingBottom:20 }}>
      <div style={{ position:"relative", width:totalW, height:totalH, minWidth:totalW }}>

        {/* Column headers */}
        {headers.map(({ label, left }) => (
          <div key={label} style={{
            position:"absolute", top:0, left, width:COL_W,
            fontFamily:"'Bebas Neue',sans-serif", fontSize:12, letterSpacing:1,
            color:"rgba(232,224,208,.35)", textAlign:"center",
            paddingBottom:5, borderBottom:"1px solid rgba(255,255,255,.07)",
          }}>{label}</div>
        ))}

        {/* SVG connectors */}
        <svg style={{ position:"absolute", top:0, left:0, width:totalW, height:totalH, pointerEvents:"none" }}>
          {connectors.map((c, i) => (
            <path key={i} d={c.d} stroke={c.color} strokeWidth={c.width} fill="none" />
          ))}
        </svg>

        {/* Match cards */}
        {ko.r16.map((m, i) => <MatchCard key={`r16-${i}`} m={m} top={r16Tops[i]} left={leftR16} label={`M${i+1}`} />)}
        {ko.qf.map((m, i)  => <MatchCard key={`qf-${i}`}  m={m} top={qfTops[i]}  left={leftQF}  label={`QF${i+1}`} />)}
        {ko.sf.map((m, i)  => <MatchCard key={`sf-${i}`}  m={m} top={sfTops[i]}  left={leftSF}  label={`SF${i+1}`} />)}
        <MatchCard m={ko.final}  top={finalTop}  left={leftFin} label="🏆 The Final" gold />
        <MatchCard m={ko.bronze} top={bronzeTop} left={leftFin} label="🥉 Bronze Final" bronze />

      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("pools");
  const [poolData, setPoolData] = useState(null);
  const [ko, setKo] = useState(null);
  const [simming, setSimming] = useState(false);
  const [openPool, setOpenPool] = useState({});

  function runSim() {
    setSimming(true);
    setTimeout(() => {
      const pd = {};
      POOL_LETTERS.forEach(l => { pd[l] = simPool(POOLS_RAW[l]); });

      const winners = {}, runners = {}, thirds = {};
      POOL_LETTERS.forEach(l => {
        const s = pd[l].standings;
        winners[l] = { ...s[0], pool: l };
        runners[l] = { ...s[1], pool: l };
        thirds[l]  = { ...s[2], pool: l };
      });

      const allThirds = Object.values(thirds).sort((a, b) =>
        b.pts - a.pts || (b.pf - b.pa) - (a.pf - a.pa) || b.pf - a.pf
      );
      const top4 = allThirds.slice(0, 4);
      const qualPools = top4.map(t => t.pool).sort();
      const qualMap = {};
      top4.forEach(t => { qualMap[t.pool] = t; });

      const mapping = TPT[qualPools.join("")] || ["?","?","?","?"];
      const getThird = code => qualMap[code?.[0]] || null;

      const r16 = [
        makeKO(winners.A, getThird(mapping[0])),
        makeKO(winners.B, getThird(mapping[1])),
        makeKO(runners.C, runners.F),
        makeKO(winners.E, runners.D),
        makeKO(runners.A, runners.E),
        makeKO(winners.F, runners.B),
        makeKO(winners.C, getThird(mapping[2])),
        makeKO(winners.D, getThird(mapping[3])),
      ];

      const qf = [
        makeKO(r16[0].winner, r16[1].winner),
        makeKO(r16[2].winner, r16[3].winner),
        makeKO(r16[4].winner, r16[5].winner),
        makeKO(r16[6].winner, r16[7].winner),
      ];

      const sf = [
        makeKO(qf[0].winner, qf[1].winner),
        makeKO(qf[2].winner, qf[3].winner),
      ];

      const bronze = makeKO(sf[0].loser, sf[1].loser);
      const final  = makeKO(sf[0].winner, sf[1].winner);

      setKo({ r16, qf, sf, bronze, final, qualPools, allThirds, top4, mapping, qualMap });
      setPoolData(pd);
      setSimming(false);
      setTab("pools");
    }, 700);
  }

  const champion = ko?.final?.winner;

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@400;600;700&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:#0a0a0f; }
    .app { min-height:100vh; background:#0a0a0f; color:#e8e0d0; font-family:'Barlow Condensed',sans-serif; }
    .nav-btn { padding:7px 14px; background:transparent; border:1px solid rgba(201,162,39,.3); color:rgba(232,224,208,.5); font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; cursor:pointer; transition:all .2s; }
    .nav-btn:hover { border-color:#C9A227; color:#C9A227; }
    .nav-btn.active { background:#C9A227; border-color:#C9A227; color:#0a0a0f; }
    .sm-btn { padding:5px 11px; background:transparent; color:#C9A227; font-size:10px; font-weight:700; letter-spacing:2px; text-transform:uppercase; border:1px solid rgba(201,162,39,.3); cursor:pointer; }
    .sm-btn:hover { background:rgba(201,162,39,.07); }
    .tbl { width:100%; border-collapse:collapse; font-size:11px; }
    .tbl th { text-align:center; padding:3px 4px; color:rgba(232,224,208,.3); font-weight:700; font-size:9px; border-bottom:1px solid rgba(255,255,255,.08); }
    .tbl th:nth-child(2) { text-align:left; }
    .tbl td { padding:4px; border-bottom:1px solid rgba(255,255,255,.03); text-align:center; }
    .tbl td:nth-child(2) { text-align:left; }
    .tbl .qual td { color:#C9A227; }
    .tbl .qual3 td { color:#7bc8d4; }
    .section-hd { font-family:'Bebas Neue',sans-serif; font-size:24px; letter-spacing:2px; color:#C9A227; border-bottom:1px solid rgba(201,162,39,.2); padding-bottom:4px; margin-bottom:12px; }
    .card { background:rgba(255,255,255,.025); border:1px solid rgba(255,255,255,.07); padding:13px; }
    .badge { display:inline-flex; align-items:center; padding:2px 8px; background:rgba(201,162,39,.08); border:1px solid rgba(201,162,39,.2); font-size:10px; font-weight:700; letter-spacing:1px; color:#C9A227; border-radius:2px; }
    .pool-grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:11px; }
  `;

  return (
    <>
      <style>{css}</style>
      <div className="app">

        {/* HERO */}
        <div style={{ textAlign:"center", padding:"28px 14px 18px", background:"radial-gradient(ellipse 80% 50% at 50% 0%, rgba(180,140,40,.14) 0%, transparent 70%)" }}>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:10, fontWeight:700, letterSpacing:4, textTransform:"uppercase", color:"#C9A227", marginBottom:5 }}>🏉 Tournament Simulator</div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(38px,8vw,70px)", lineHeight:.9, color:"#f0e6c8", textShadow:"0 0 50px rgba(201,162,39,.3)" }}>
            Rugby <span style={{ color:"#C9A227" }}>World</span> Cup
          </div>
          <div style={{ display:"flex", justifyContent:"center", gap:6, marginTop:9, flexWrap:"wrap" }}>
            <span className="badge">📊 Regression model</span>
            <span className="badge">540 RWC matches</span>
            <span className="badge">R²=0.56 · σ=12.8655</span>
          </div>
        </div>

        {!poolData ? (
          /* PRE-SIM */
          <div style={{ padding:"16px 14px", maxWidth:1100, margin:"0 auto" }}>
            <div style={{ background:"rgba(201,162,39,.05)", border:"1px solid rgba(201,162,39,.18)", padding:"13px 16px", marginBottom:18, lineHeight:1.7, fontSize:13, color:"rgba(232,224,208,.7)" }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:17, color:"#C9A227", marginBottom:6, letterSpacing:1 }}>How Scores Are Predicted</div>
              Regression fitted on <strong style={{ color:"#e8e0d0" }}>540 World Cup matches (2003–2023)</strong>:&nbsp;
              <code style={{ color:"#C9A227", fontSize:12 }}>Score = 47.104 + 1.020×TeamWR − 1.299×OppWR</code><br/>
              Each score drawn from <strong style={{ color:"#e8e0d0" }}>Normal(predicted, σ=12.8655)</strong>.
              Win% = 1 − NORMDIST(0, predA−predB, σ, TRUE).
              Draws allowed in pool stage. KO scores resampled until strictly different.
            </div>

            <div className="pool-grid" style={{ marginBottom:20 }}>
              {POOL_LETTERS.map(letter => (
                <div key={letter} className="card">
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:17, letterSpacing:2, color:"#C9A227", marginBottom:9 }}>Pool {letter}</div>
                  {POOLS_RAW[letter].map(team => {
                    const others = POOLS_RAW[letter].filter(o => o.name !== team.name);
                    const avgWp = others.reduce((s, o) => s + winPct(team.rating, o.rating), 0) / others.length;
                    return (
                      <div key={team.name} style={{ padding:"5px 0", borderBottom:"1px solid rgba(255,255,255,.04)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:13, fontWeight:600 }}>
                          <Flag code={team.fc} size={18} />
                          <span style={{ flex:1 }}>{team.name}</span>
                          <span style={{ fontSize:10, color:"rgba(232,224,208,.38)" }}>WR {team.rating.toFixed(1)}</span>
                        </div>
                        <WinBar prob={avgWp} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div style={{ textAlign:"center" }}>
              <p style={{ fontSize:12, color:"rgba(232,224,208,.45)", maxWidth:440, margin:"0 auto 16px", lineHeight:1.6 }}>
                Win bars = avg win % vs pool opponents. Win 4pts · Draw 2pts · 4-try bonus +1 · Lose by &lt;8 +1.
              </p>
              <button
                onClick={runSim}
                disabled={simming}
                style={{ padding:"12px 34px", background:"#C9A227", color:"#0a0a0f", fontFamily:"'Bebas Neue',sans-serif", fontSize:21, letterSpacing:2, border:"none", cursor: simming ? "not-allowed" : "pointer", clipPath:"polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0 100%)", opacity: simming ? .5 : 1 }}
              >
                {simming ? "Simulating…" : "▶  Simulate Tournament"}
              </button>
            </div>
          </div>

        ) : (
          /* POST-SIM */
          <>
            {champion && (
              <div style={{ textAlign:"center", padding:"22px 14px", background:"radial-gradient(ellipse 50% 70% at 50% 50%, rgba(201,162,39,.12) 0%, transparent 70%)", borderBottom:"1px solid rgba(201,162,39,.14)" }}>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:5, textTransform:"uppercase", color:"rgba(201,162,39,.5)", marginBottom:4 }}>🏆 World Cup Champion</div>
                <Flag code={champion.fc} size={48} />
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(32px,6vw,56px)", color:"#C9A227", letterSpacing:4, textShadow:"0 0 30px rgba(201,162,39,.5)", marginTop:4 }}>{champion.name}</div>
                <div style={{ fontSize:11, color:"rgba(232,224,208,.38)", marginTop:3 }}>
                  WR {champion.rating.toFixed(2)} · Final win prob: {fmtPct(winPct(champion.rating, ko.final[champion.name === ko.final.a.name ? "b" : "a"].rating))}
                </div>
              </div>
            )}

            <div style={{ display:"flex", justifyContent:"center", gap:5, padding:"11px 14px", flexWrap:"wrap" }}>
              {[["pools","Pools"],["thirds","3rd Place"],["ko","Knockout"]].map(([key, label]) => (
                <button key={key} className={`nav-btn${tab === key ? " active" : ""}`} onClick={() => setTab(key)}>{label}</button>
              ))}
              <button className="sm-btn" style={{ marginLeft:7 }} onClick={() => { setPoolData(null); setKo(null); setOpenPool({}); }}>↺ Reset</button>
              <button className="sm-btn" onClick={runSim}>⟳ Re-sim</button>
            </div>

            <div style={{ maxWidth:1200, margin:"0 auto", padding:"0 12px 48px" }}>

              {/* POOLS TAB */}
              {tab === "pools" && (
                <>
                  <div className="section-hd">Pool Stage</div>
                  <div className="pool-grid">
                    {POOL_LETTERS.map(letter => {
                      const { standings, matches } = poolData[letter];
                      return (
                        <div key={letter} className="card">
                          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:17, letterSpacing:2, color:"#C9A227", marginBottom:9 }}>Pool {letter}</div>
                          <table className="tbl">
                            <thead>
                              <tr>
                                <th>#</th><th>Team</th>
                                <th title="Wins">W</th>
                                <th title="Draws">D</th>
                                <th title="Losses">L</th>
                                <th title="Points For">PF</th>
                                <th title="Points Against">PA</th>
                                <th title="Point Difference">PD</th>
                                <th title="Tries For">TF</th>
                                <th title="Tries Against">TA</th>
                                <th title="Bonus Points">B</th>
                                <th title="Total Points">Pts</th>
                              </tr>
                            </thead>
                            <tbody>
                              {standings.map((team, i) => (
                                <tr key={team.name} className={i < 2 ? "qual" : i === 2 ? "qual3" : ""}>
                                  <td>
                                    <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:14, height:14, fontSize:9, fontWeight:700, background:"rgba(255,255,255,.06)", borderRadius:2 }}>{i+1}</span>
                                  </td>
                                  <td>
                                    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                                      <Flag code={team.fc} size={14} />
                                      <span>{team.name}</span>
                                    </div>
                                  </td>
                                  <td>{team.wins}</td>
                                  <td>{team.draws}</td>
                                  <td>{team.losses}</td>
                                  <td>{team.pf}</td>
                                  <td>{team.pa}</td>
                                  <td>{team.pf - team.pa > 0 ? "+" : ""}{team.pf - team.pa}</td>
                                  <td>{team.tf}</td>
                                  <td>{team.ta}</td>
                                  <td>{team.bonus}</td>
                                  <td><strong>{team.pts}</strong></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div style={{ marginTop:8 }}>
                            <button className="sm-btn" style={{ fontSize:9, padding:"2px 7px" }} onClick={() => setOpenPool(prev => ({ ...prev, [letter]: !prev[letter] }))}>
                              {openPool[letter] ? "▲ Hide" : "▼ Show"} Results
                            </button>
                            {openPool[letter] && (
                              <div style={{ marginTop:7 }}>
                                {matches.map((m, i) => (
                                  <div key={i} style={{ marginBottom:5 }}>
                                    <div style={{ display:"flex", alignItems:"center", padding:"4px 6px", background:"rgba(255,255,255,.018)", fontSize:11, gap:5 }}>
                                      <Flag code={m.afC} size={14} />
                                      <span style={{ flex:1 }}>{m.a}</span>
                                      <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:14, color: m.isDraw ? "#7bc8d4" : "#C9A227", minWidth:60, textAlign:"center" }}>
                                        {m.scoreA}–{m.scoreB}
                                        {m.isDraw && (
                                          <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:8, fontWeight:700, color:"#7bc8d4", background:"rgba(120,180,200,.15)", border:"1px solid rgba(120,180,200,.3)", padding:"0 3px", borderRadius:2, marginLeft:3, verticalAlign:"middle" }}>DRAW</span>
                                        )}
                                      </span>
                                      <span style={{ flex:1, textAlign:"right" }}>{m.b}</span>
                                      <Flag code={m.bfC} size={14} />
                                    </div>
                                    <div style={{ display:"flex", alignItems:"center", padding:"2px 6px", gap:5 }}>
                                      <div style={{ flex:1, height:2, background:"rgba(255,255,255,.05)", borderRadius:1, overflow:"hidden" }}>
                                        <div style={{ width: fmtPct(m.wp), height:"100%", background:`hsl(${40 + m.wp*80},70%,50%)` }} />
                                      </div>
                                      <span style={{ fontSize:9, color:"rgba(232,224,208,.28)", minWidth:70, textAlign:"right" }}>{fmtPct(m.wp)} pre-match</span>
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
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", fontSize:11, color:"rgba(232,224,208,.38)", marginTop:10, alignItems:"center" }}>
                    <span style={{ color:"#C9A227" }}>■</span><span>Qualified (Top 2)</span>
                    <span style={{ color:"#7bc8d4" }}>■</span><span>3rd-place eligible</span>
                    <span style={{ color:"#7bc8d4", fontWeight:700 }}>DRAW</span><span>= 2pts each</span>
                    <span style={{ marginLeft:"auto" }}>Win 4pts · Draw 2pts · 4-try bonus +1 · Lose by &lt;8 +1</span>
                  </div>
                </>
              )}

              {/* THIRDS TAB */}
              {tab === "thirds" && ko && (
                <>
                  <div className="section-hd">Third-Place Rankings</div>
                  <p style={{ fontSize:13, color:"rgba(232,224,208,.5)", marginBottom:13 }}>
                    Top 4 qualify. Permutation key: <strong style={{ color:"#C9A227" }}>{ko.qualPools.join("")}</strong>
                  </p>
                  <div style={{ overflowX:"auto", marginBottom:22 }}>
                    <table className="tbl" style={{ minWidth:560 }}>
                      <thead>
                        <tr>
                          <th>#</th><th>Team</th><th>Pool</th><th>WR</th>
                          <th>W</th><th>D</th><th>L</th>
                          <th>PF</th><th>PA</th><th>PD</th>
                          <th>TF</th><th>TA</th><th>B</th><th>Pts</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {ko.allThirds.map((team, i) => (
                          <tr key={team.name} style={{ opacity: i >= 4 ? .4 : 1 }}>
                            <td>{i+1}</td>
                            <td><div style={{ display:"flex", alignItems:"center", gap:5 }}><Flag code={team.fc} size={14}/><span>{team.name}</span></div></td>
                            <td style={{ color:"#C9A227", fontWeight:700 }}>Pool {team.pool}</td>
                            <td style={{ fontSize:10, color:"rgba(232,224,208,.38)" }}>{team.rating.toFixed(1)}</td>
                            <td>{team.wins}</td><td>{team.draws}</td><td>{team.losses}</td>
                            <td>{team.pf}</td><td>{team.pa}</td>
                            <td>{team.pf - team.pa > 0 ? "+" : ""}{team.pf - team.pa}</td>
                            <td>{team.tf}</td><td>{team.ta}</td><td>{team.bonus}</td>
                            <td><strong>{team.pts}</strong></td>
                            <td style={{ fontSize:10 }}>
                              {i < 4 ? <span style={{ color:"#C9A227", fontWeight:700 }}>✓</span> : <span style={{ color:"rgba(232,224,208,.25)" }}>–</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="section-hd" style={{ fontSize:18 }}>R16 Assignments</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))", gap:9, maxWidth:800 }}>
                    {[["Winner Pool A","M1",ko.mapping[0]],["Winner Pool B","M2",ko.mapping[1]],["Winner Pool C","M7",ko.mapping[2]],["Winner Pool D","M8",ko.mapping[3]]].map(([seed, match, code]) => {
                      const opp = ko.qualMap[code?.[0]];
                      return (
                        <div key={seed} className="card">
                          <div style={{ fontSize:9, fontWeight:700, letterSpacing:1, color:"rgba(232,224,208,.28)", marginBottom:4 }}>{match}</div>
                          <div style={{ fontSize:13, fontWeight:700, color:"#C9A227", marginBottom:2 }}>{seed}</div>
                          <div style={{ fontSize:10, color:"rgba(232,224,208,.33)", marginBottom:5 }}>vs {code}</div>
                          {opp
                            ? <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, fontWeight:700 }}><Flag code={opp.fc} size={16}/>{opp.name}</div>
                            : <div style={{ fontSize:12, color:"rgba(232,224,208,.25)" }}>—</div>}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* KNOCKOUT TAB */}
              {tab === "ko" && ko && (
                <>
                  <div className="section-hd">Knockout Stage</div>
                  <Bracket ko={ko} />
                  <div style={{ marginTop:12, padding:"9px 13px", background:"rgba(201,162,39,.04)", border:"1px solid rgba(201,162,39,.13)", fontSize:11, color:"rgba(232,224,208,.4)", lineHeight:1.7 }}>
                    <strong style={{ color:"rgba(201,162,39,.65)" }}>Model:</strong> Score ~ Normal(47.104 + 1.0203×WR − 1.2994×OppWR, σ=12.8655).
                    Win% = 1 − NORMDIST(0, predA−predB, σ, TRUE). KO scores resampled until strictly different. Fitted on 540 RWC matches 2003–2023.
                  </div>
                </>
              )}

            </div>
          </>
        )}
      </div>
    </>
  );
}
