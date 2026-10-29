/* Shared widget library for the design rounds (v1, frozen so archived rounds keep working). */
/* ======================= settings ======================= */
const PLACE={lat:38.9784,lon:-76.4922,tz:'America/New_York'};
const MAPBOX_TOKEN='',GITHUB_USER='caseycavanagh';
const LOGO_SVG=`<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="currentColor"/><text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="Inter" font-weight="700" font-size="24" fill="#fff" letter-spacing="-1">CC</text></svg>`;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const now=()=>new Date(new Date().toLocaleString('en-US',{timeZone:PLACE.tz}));
const seeded=i=>Math.abs(Math.sin(i*12.9898)*43758.5453)%1;
const el=h=>{const t=document.createElement('template');t.innerHTML=h.trim();return t.content.firstElementChild};
const PLAY='<svg viewBox="0 0 14 14"><path d="M3 1.5v11l9.5-5.5z"/></svg>',PAUSE='<svg viewBox="0 0 14 14"><path d="M2.5 1.5h3.5v11H2.5zM8 1.5h3.5v11H8z"/></svg>';
document.addEventListener('click',e=>{if(e.target.closest('a[href="#"]'))e.preventDefault()});
const wide=()=>innerWidth>=1180;

/* ======================= names, icons, copy ======================= */
const I=p=>`<svg class="ico" viewBox="0 0 16 16">${p}</svg>`;
const META={
  logo:{label:'Logo',short:'Logo',icon:I('<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/>')},
  contrib:{label:'Contributions',short:'Shipping',icon:I('<rect x="2.5" y="2.5" width="3" height="3" rx=".6"/><rect x="6.5" y="2.5" width="3" height="3" rx=".6"/><rect x="10.5" y="2.5" width="3" height="3" rx=".6"/><rect x="2.5" y="6.5" width="3" height="3" rx=".6"/><rect x="6.5" y="6.5" width="3" height="3" rx=".6" fill="currentColor"/><rect x="10.5" y="6.5" width="3" height="3" rx=".6"/><rect x="2.5" y="10.5" width="3" height="3" rx=".6" fill="currentColor"/><rect x="6.5" y="10.5" width="3" height="3" rx=".6"/><rect x="10.5" y="10.5" width="3" height="3" rx=".6"/>')},
  felix:{label:'Felix AI demo',short:'Felix',icon:I('<path d="M8 2l1.5 3.5L13 7l-3.5 1.5L8 12l-1.5-3.5L3 7l3.5-1.5z"/>')},
  recipe:{label:'This week’s pour',short:'Pour',icon:I('<path d="M3 3h10L8 8.5z"/><path d="M8 8.5V13M5.5 13h5"/>')},
  music:{label:'Latest track',short:'Music',icon:I('<path d="M6 11V3.8l6-1.3v7"/><circle cx="4.6" cy="11.2" r="1.6"/><circle cx="10.6" cy="9.6" r="1.6"/>')},
  played:{label:'Last played',short:'Listening',icon:I('<path d="M3 10V8a5 5 0 0 1 10 0v2"/><rect x="2.3" y="9.5" width="2.6" height="4" rx="1"/><rect x="11.1" y="9.5" width="2.6" height="4" rx="1"/>')},
  map:{label:'Annapolis',short:'Map',icon:I('<path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.8 8 14 8 14z"/><circle cx="8" cy="6.5" r="1.5"/>')},
  weather:{label:'Weather',short:'Weather',icon:I('<circle cx="8" cy="8" r="2.8"/><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1"/>')},
  clock:{label:'Local time',short:'Time',icon:I('<circle cx="8" cy="8" r="5.8"/><path d="M8 4.8V8l2.2 1.6"/>')},
};
const ORDER=['contrib','felix','recipe','music','played','map','weather','clock','logo'];
const COPY=[
  {t:'Product designer who {contrib|codes}, 13+ years in.'},
  {t:'Staff Product Designer at <a href="#">Quantum Metric</a>, leading <a href="#">Nova</a>, the company’s design system, and {felix|Felix AI}, an agentic AI analyst.'},
  {t:'Previously <a href="#">Spotify</a> and <a href="#">Capital One</a>.',m:1},
  {t:'On the side I run <a href="#">Levon</a>, a marketplace for music gear and spaces, and write {recipe|Little Libations}, a newsletter for the curious amateur bartender.'},
  {t:'I also write and record {music|alt-country music}.'},
  {t:'When I’m not making it, I’m usually {played|listening to it}.'},
  {t:'I live in {map|Annapolis, Maryland}.'},
  {t:'It’s {weather|<span class="wl-temp">71°</span> and <span class="wl-cond">clear</span>} here right now.'},
  {t:'The best way to reach me is <a href="mailto:casey@caseycavanagh.com">email</a>. I’m on {clock|Eastern time}.',m:1},
];
const NAME='{logo|Casey Cavanagh}';
const TOGGLE=`<button class="tt" aria-label="Toggle theme"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor"/></svg></button>`;

/* live glyphs for b2 */
const GLYPH={
  weather:'<span class="lg-wx" data-glyph="weather">71°</span>',
  clock:'<span class="lg-clk"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.2"/><line class="gh" x1="8" y1="8" x2="8" y2="4.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line class="gm2" x1="8" y1="8" x2="8" y2="3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg></span>',
  contrib:'<span class="lg-grid" data-glyph="contrib">'+'<i style="--o:.15"></i>'.repeat(12)+'</span>',
  music:'<span class="lg-eq" style="display:inline-flex;align-items:center;height:22px"><i></i><i></i><i></i></span>',
  played:'<span class="lg-img" style="display:block;height:22px;background:url(https://picsum.photos/id/453/80/80)"></span>',
  recipe:'<span class="lg-img" style="display:block;height:22px;background:url(https://picsum.photos/id/431/80/80)"></span>',
  felix:'<span class="lg-tw" style="display:grid;place-items:center;color:#22b07d">'+I('<path d="M8 2l1.5 3.5L13 7l-3.5 1.5L8 12l-1.5-3.5L3 7l3.5-1.5z" fill="currentColor" stroke="none"/>')+'</span>',
  map:I('<path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.8 8 14 8 14z" fill="var(--accent)" stroke="none"/><circle cx="8" cy="6.5" r="1.5" fill="#fff" stroke="none"/>'),
  logo:'<span class="lg-logo" style="display:grid;place-items:center;height:22px">CC</span>',
};

/* ======================= live data ======================= */
const WMO=c=>c===0?['clear','Clear','clear']:c<=2?['partly cloudy','Partly cloudy','clear']:c===3?['overcast','Overcast','cloudy']:c<=48?['foggy','Fog','fog']:c<=67?['raining','Rain','rain']:c<=77?['snowing','Snow','snow']:c<=82?['showery','Showers','rain']:c<=86?['snowing','Snow showers','snow']:['stormy','Thunderstorms','storm'];
const PALETTES={'clear-day':['#2f6fcf','#6fa8ea','#f3d9b0'],'clear-night':['#070b1d','#1c2557','#4b3a7a'],'dawn':['#2e2f6b','#e0876a','#f6c8a0'],'dusk':['#3b2a5e','#e2745a','#f2b48a'],'cloudy-day':['#6b7682','#a3adb7','#d9dee3'],'cloudy-night':['#12151c','#262b35','#3c4350'],'rain-day':['#2f3b4b','#56677c','#8a9bb0'],'rain-night':['#0b0f16','#1d2633','#34445a'],'snow-day':['#b7c6d4','#e6edf3','#ffffff'],'snow-night':['#1a2333','#3c4a60','#8a9ab3'],'fog-day':['#a4aab0','#cfd3d6','#eceeef'],'fog-night':['#1a1c20','#2d3035','#4a4e55'],'storm-day':['#1d2430','#3b4658','#6c7a91'],'storm-night':['#07090d','#161b24','#2c3546']};
let W=null;const listeners=[],themeHooks=[];
function mood(){if(!W)return'clear-day';const d=now(),m=d.getHours()*60+d.getMinutes(),day=m>=W.sunrise&&m<W.sunset,k=WMO(W.code)[2];if(k==='clear'){if(Math.abs(m-W.sunrise)<50)return'dawn';if(Math.abs(m-W.sunset)<50)return'dusk';return day?'clear-day':'clear-night'}return`${k}-${day?'day':'night'}`}
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255),lum=([r,g,b])=>.2126*r+.7152*g+.0722*b;
async function loadWeather(){try{const u=`https://api.open-meteo.com/v1/forecast?latitude=${PLACE.lat}&longitude=${PLACE.lon}&current=temperature_2m,weather_code&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=${encodeURIComponent(PLACE.tz)}&forecast_days=1`;
  const j=await (await fetch(u)).json(),hm=s=>{const [h,m]=s.split('T')[1].split(':');return +h*60+ +m};
  W={temp:Math.round(j.current.temperature_2m),code:j.current.weather_code,sunrise:hm(j.daily.sunrise[0]),sunset:hm(j.daily.sunset[0]),hi:Math.round(j.daily.temperature_2m_max[0]),lo:Math.round(j.daily.temperature_2m_min[0])}}catch(e){}
  if(W){$$('.wl-temp').forEach(e=>e.textContent=W.temp+'°');$$('.wl-cond').forEach(e=>e.textContent=WMO(W.code)[0]);
    const P=PALETTES[mood()];$$('[data-glyph=weather]').forEach(g=>{g.textContent=W.temp+'°';g.style.setProperty('--skyg',`linear-gradient(135deg,${P[0]},${P[1]})`);g.classList.toggle('ink',lum(hex(P[1]))>.62)})}
  listeners.forEach(f=>f())}
let contribDays=null;const contribP=fetch(`https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(GITHUB_USER)}?y=last`).then(r=>r.json()).then(j=>{contribDays=j.contributions;
  const last=contribDays.slice(-12),O=[.12,.35,.55,.8,1];$$('[data-glyph=contrib]').forEach(g=>g.innerHTML=last.map(d=>`<i style="--o:${O[d.level]}"></i>`).join(''))}).catch(()=>{});
// tiny ticking clocks in the glyphs
setInterval(()=>{const d=now();$$('.lg-clk').forEach(c=>{$('.gh',c).setAttribute('transform',`rotate(${(d.getHours()%12+d.getMinutes()/60)*30} 8 8)`);$('.gm2',c).setAttribute('transform',`rotate(${d.getMinutes()*6+d.getSeconds()/10} 8 8)`)})},1000);

/* ======================= widgets ======================= */
const WIDGETS={
  logo:{build(){const n=el('<div class="dvd"><span class="logo"></span></div>'),L=$('.logo',n);L.innerHTML=LOGO_SVG;const C=['#e5672e','#3a5bff','#22b07d','#c03fa0','#e8a23a'];let ci=0,x=30,y=24,vx=1.2,vy=.9,drag=null,hist=[];
    const step=()=>{if(n.isConnected&&n.clientWidth){const Wd=n.clientWidth-L.offsetWidth,Hd=n.clientHeight-L.offsetHeight;if(!drag){x+=vx;y+=vy;let hit=false;if(x<=0){x=0;vx=Math.abs(vx)*.85;hit=true}if(x>=Wd){x=Wd;vx=-Math.abs(vx)*.85;hit=true}if(y<=0){y=0;vy=Math.abs(vy)*.85;hit=true}if(y>=Hd){y=Hd;vy=-Math.abs(vy)*.85;hit=true}if(hit){ci=(ci+1)%C.length;L.style.setProperty('--c',C[ci])}vx*=.995;vy*=.995;const sp=Math.hypot(vx,vy);if(sp<.9&&sp>0){vx*=.9/sp;vy*=.9/sp}}L.style.transform=`translate(${x}px,${y}px)`}requestAnimationFrame(step)};step();
    L.addEventListener('pointerdown',e=>{e.stopPropagation();L.setPointerCapture(e.pointerId);const r=n.getBoundingClientRect();drag={dx:e.clientX-r.left-x,dy:e.clientY-r.top-y};hist=[]});
    L.addEventListener('pointermove',e=>{if(!drag)return;const r=n.getBoundingClientRect();x=Math.max(0,Math.min(n.clientWidth-L.offsetWidth,e.clientX-r.left-drag.dx));y=Math.max(0,Math.min(n.clientHeight-L.offsetHeight,e.clientY-r.top-drag.dy));hist.push({x,y,t:performance.now()});if(hist.length>5)hist.shift()});
    L.addEventListener('pointerup',()=>{if(hist.length>1){const a=hist[0],b=hist.at(-1),dt=Math.max(16,b.t-a.t)/16;vx=(b.x-a.x)/dt;vy=(b.y-a.y)/dt}drag=null});return n}},
  contrib:{h:'140px',build(){const n=el('<div class="gm"><div class="grid"></div><span class="total"></span></div>');contribP.then(()=>{let days=contribDays;if(!days){const t=new Date();days=[...Array(365)].map((_,i)=>{const d=new Date(t);d.setDate(t.getDate()-364+i);const c=seeded(i)<.4?0:Math.round(seeded(i)**2*10);return{date:d.toISOString().slice(0,10),count:c,level:c?Math.min(4,1+Math.floor(c/3)):0}})}
    const D=s=>new Date(s+'T12:00'),wk=30,slice=days.slice(-(wk*7-(6-D(days.at(-1).date).getDay()))),pad=D(slice[0].date).getDay();
    $('.grid',n).innerHTML=[...Array(pad).fill(null),...slice].map(d=>d?`<i data-l="${d.level}"></i>`:'<i class="pad"></i>').join('');$('.total',n).innerHTML=`<b>${slice.reduce((a,d)=>a+d.count,0)}</b> contributions, last six months`});return n}},
  felix:{build(){const n=el('<div class="chat"></div>'),convo=[['u','Why did checkout conversion drop yesterday?'],['a','Down 4.2% after 3pm. Most affected sessions hit a slow payment step on iOS Safari.'],['u','How many people?'],['a','About 18k sessions. Want me to pull the worst replays?']];let i=0;
    const add=(c,h)=>{const d=document.createElement('div');d.className='msg '+c;d.innerHTML=h;n.append(d);while(n.children.length>5)n.firstChild.remove();return d};
    const step=()=>{if(!n.isConnected){setTimeout(step,600);return}if(i>=convo.length){i=0;n.innerHTML=''}const [r,t]=convo[i++];if(r==='u'){add('u',t);setTimeout(step,900)}else{const d=add('a','<span class="dots"><i></i><i></i><i></i></span>');setTimeout(()=>{d.textContent='';let k=0;const ty=setInterval(()=>{d.textContent=t.slice(0,++k);if(k>=t.length){clearInterval(ty);setTimeout(step,1800)}},18)},1000)}};setTimeout(step,350);return n}},
  recipe:{build(){return el('<img src="https://picsum.photos/id/431/1200/700" alt="This week’s cocktail">')}},
  music:{build(){const n=el(`<div class="player"><img src="https://picsum.photos/id/453/1200/700" alt=""><div class="scrim"></div><span class="pb">${PLAY}</span><div class="bars"></div></div>`),b=$('.pb',n),bars=$('.bars',n);let p=0,t=null;
    bars.innerHTML=[...Array(40)].map((_,i)=>`<i style="height:${22+Math.abs(Math.sin(i*1.7)*Math.cos(i*.4))*78}%"></i>`).join('');const bs=[...bars.children];
    n.onclick=e=>{e.stopPropagation();if(t){clearInterval(t);t=null;b.innerHTML=PLAY}else{b.innerHTML=PAUSE;t=setInterval(()=>{if(!n.isConnected)return;p=(p+.004)%1;bs.forEach((x,i)=>x.classList.toggle('past',i/bs.length<p))},100)}};return n}},
  played:{h:'92px',build(){return el('<div class="lp"><span class="cover" style="background-image:url(https://picsum.photos/id/453/300/300)"></span><div class="tx"><div class="when"><i></i><span>Last played 42 min ago</span></div><b>Demo track</b><span class="ar">Demo artist</span></div></div>')}},
  map:{build(){const n=el('<div class="map"><span class="me"></span></div>');const draw=()=>{if(!n.isConnected||!n.clientWidth)return;const dark=document.documentElement.dataset.theme==='dark',Wd=n.clientWidth,Hd=n.clientHeight;if(n._drawn===`${Wd}x${Hd}${dark}`)return;n._drawn=`${Wd}x${Hd}${dark}`;$$('img,.tiles,.credit',n).forEach(e=>e.remove());
      if(MAPBOX_TOKEN){n.insertAdjacentHTML('afterbegin',`<img class="static" alt="Map of Annapolis" src="https://api.mapbox.com/styles/v1/mapbox/${dark?'dark-v11':'light-v11'}/static/${PLACE.lon},${PLACE.lat},12.6,0/${Math.min(1280,Math.round(Wd))}x${Math.min(1280,Math.round(Hd))}@2x?attribution=false&logo=false&access_token=${MAPBOX_TOKEN}">`);n.insertAdjacentHTML('beforeend','<span class="credit">© Mapbox © OpenStreetMap</span>');return}
      const z=13,N=2**z,fx=(PLACE.lon+180)/360*N,lat=PLACE.lat*Math.PI/180,fy=(1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2*N,ox=Wd/2-fx*256,oy=Hd/2-fy*256,layer=dark?'World_Dark_Gray_Base':'World_Light_Gray_Base';let h='<div class="tiles">';
      for(let x=Math.floor(-ox/256);x<=Math.floor((Wd-ox)/256);x++)for(let y=Math.floor(-oy/256);y<=Math.floor((Hd-oy)/256);y++)h+=`<img alt="" src="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${layer}/MapServer/tile/${z}/${y}/${x}" style="left:${ox+x*256}px;top:${oy+y*256}px">`;
      n.insertAdjacentHTML('afterbegin',h+'</div>');n.insertAdjacentHTML('beforeend','<span class="credit">Tiles © Esri, © OpenStreetMap</span>')};themeHooks.push(()=>{n._drawn='';draw()});new ResizeObserver(()=>draw()).observe(n);return n}},
  weather:{build(){const n=el('<div class="wx"><canvas></canvas><div class="in"><div class="place"><span>Annapolis</span><span class="x-time"></span></div><div class="main"><div class="temp">--°</div><div class="side"><span class="cond">…</span><span class="hl"></span></div></div></div></div>');
    const cv=$('canvas',n),gl=cv.getContext('webgl',{antialias:false});let cur=PALETTES[mood()].map(hex),tgt=cur.map(x=>[...x]);
    const text=()=>{$('.x-time',n).textContent=now().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});$('.temp',n).textContent=W?W.temp+'°':'--°';$('.cond',n).textContent=W?WMO(W.code)[1]:'';$('.hl',n).textContent=W?`H ${W.hi}°  L ${W.lo}°`:'';const P=PALETTES[mood()];tgt=P.map(hex);n.style.setProperty('--ink',(lum(hex(P[1]))+lum(hex(P[2])))/2>.62?'#1a1a1a':'#fff')};listeners.push(text);setInterval(text,30000);text();
    if(gl){const VS='attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}',FS=`precision highp float;uniform vec2 r;uniform float t;uniform vec3 a,b,c;vec2 h2(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(dot(h2(i)*2.-1.,f),dot(h2(i+vec2(1,0))*2.-1.,f-vec2(1,0)),u.x),mix(dot(h2(i+vec2(0,1))*2.-1.,f-vec2(0,1)),dot(h2(i+vec2(1,1))*2.-1.,f-vec2(1,1)),u.x),u.y);}float fbm(vec2 p){float s=0.,w=.5;for(int i=0;i<5;i++){s+=w*noise(p);p*=2.02;w*=.5;}return s;}void main(){vec2 uv=gl_FragCoord.xy/r;vec2 q=uv*vec2(r.x/r.y,1.)*1.3;float n1=fbm(q+vec2(t*.035,-t*.02));float n2=fbm(q*1.4+vec2(-t*.025,t*.03)+n1*1.6);vec3 col=mix(a,b,smoothstep(-.35,.45,n1+uv.y*.35));col=mix(col,c,smoothstep(.05,.55,n2)*.75);float g=fract(sin(dot(gl_FragCoord.xy+t*61.,vec2(12.9898,78.233)))*43758.5453);col+=(g-.5)*.07;gl_FragColor=vec4(col,1.);}`;
      const sh=(ty,s)=>{const x=gl.createShader(ty);gl.shaderSource(x,s);gl.compileShader(x);return x},pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);gl.useProgram(pr);
      gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
      const U=k=>gl.getUniformLocation(pr,k),uR=U('r'),uT=U('t'),uA=U('a'),uB=U('b'),uC=U('c'),t0=performance.now();
      const frame=()=>{if(n.isConnected&&cv.clientWidth){const dpr=Math.min(2,devicePixelRatio),w=cv.clientWidth*dpr,h=cv.clientHeight*dpr;if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;gl.viewport(0,0,w,h)}cur=cur.map((c,i)=>c.map((v,j)=>v+(tgt[i][j]-v)*.04));gl.uniform2f(uR,w,h);gl.uniform1f(uT,(performance.now()-t0)/1000);gl.uniform3fv(uA,cur[0]);gl.uniform3fv(uB,cur[1]);gl.uniform3fv(uC,cur[2]);gl.drawArrays(gl.TRIANGLE_STRIP,0,4)}requestAnimationFrame(frame)};requestAnimationFrame(frame)}
    return n}},
  clock:{build(){const n=el('<div class="braun"><svg viewBox="0 0 100 100"></svg></div>'),s=$('svg',n);let t=`<circle class="rim" cx="50" cy="50" r="47"/>`;
    for(let i=0;i<60;i++){const a=i*Math.PI/30;t+=i%5?`<line class="min" x1="${50+43*Math.sin(a)}" y1="${50-43*Math.cos(a)}" x2="${50+41.5*Math.sin(a)}" y2="${50-41.5*Math.cos(a)}"/>`:`<line class="hr" x1="${50+43*Math.sin(a)}" y1="${50-43*Math.cos(a)}" x2="${50+40.5*Math.sin(a)}" y2="${50-40.5*Math.cos(a)}"/>`}
    for(let h=1;h<=12;h++){const a=h*Math.PI/6;t+=`<text class="num" x="${50+34*Math.sin(a)}" y="${50-34*Math.cos(a)}">${h}</text>`}
    t+=`<line class="hand hh" x1="50" y1="54" x2="50" y2="27" stroke-width="3.2"/><line class="hand mh" x1="50" y1="55" x2="50" y2="14" stroke-width="2.2"/><g class="sec-w"><line class="sec" x1="50" y1="62" x2="50" y2="11" stroke-width="1" stroke-linecap="round"/><circle class="cap" cx="50" cy="60" r="2.6"/></g><circle class="cap" cx="50" cy="50" r="2.2"/>`;s.innerHTML=t;
    let last=-1,turns=0;const u=()=>{const d=now(),S=d.getSeconds();if(S<last)turns++;last=S;$('.hh',s).style.transform=`rotate(${(d.getHours()%12+d.getMinutes()/60)*30}deg)`;$('.mh',s).style.transform=`rotate(${(d.getMinutes()+S/60)*6}deg)`;$('.sec-w',s).style.transform=`rotate(${(S+turns*60)*6}deg)`};u();setInterval(u,1000);return n}},
};

function spring({stiffness=200,damping=22,mass=1}={}){let x=0,v=0,t=0;const dt=1/240,pts=[0];while(t<2.5){const f=-stiffness*(x-1)-damping*v;v+=f/mass*dt;x+=v*dt;t+=dt;pts.push(x);if(t>.15&&Math.abs(x-1)<.0008&&Math.abs(v)<.005)break}const step=Math.max(1,Math.round(pts.length/80)),s=[];for(let i=0;i<pts.length;i+=step)s.push(+pts[i].toFixed(4));s.push(1);return{easing:`linear(${s.join(',')})`,duration:Math.round(t*1000)}}
const OPEN=spring({stiffness:190,damping:24}),CLOSE=spring({stiffness:300,damping:34}),POP=spring({stiffness:260,damping:22}),GAP=14;
const media=(k,node)=>{const w=WIDGETS[k],m=el('<div class="media"><div class="fill"></div></div>'),f=$('.fill',m);f.style.setProperty('--ar',w.h?'auto':'16/9');if(w.h)f.style.setProperty('--h',w.h);if(node)f.append(node);m.dataset.k=k;return m};

