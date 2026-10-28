// Visitor crates: anyone can make a crate at vinyl-make.html and share it as a link,
// vinyl-prototype.html?by=Sam&d=<ids>. d holds Discogs release IDs in base 36, joined by
// dots, so the whole crate lives in the address: no account or database.
// Records come from Discogs through /api/discogs (vinyl pressings, with backs). Without a
// DISCOGS_TOKEN they come from MusicBrainz and the Cover Art Archive through /api/musicbrainz
// (m holds those release IDs), and if that fails, from Apple Music by JSONP (c).
(()=>{
  const MAX=100;
  const ITUNES='https://itunes.apple.com/';

  function jsonp(url){
    return new Promise((res,rej)=>{
      const cb='vc'+Math.random().toString(36).slice(2),s=document.createElement('script');
      const done=(f,v)=>{clearTimeout(t);delete window[cb];s.remove();f(v)};
      const t=setTimeout(()=>done(rej,new Error('timeout')),10000);
      window[cb]=d=>done(res,d);
      s.onerror=()=>done(rej,new Error('failed'));
      s.src=url+(url.includes('?')?'&':'?')+'callback='+cb;
      document.head.append(s);
    });
  }

  const slug=(a,t)=>(a+' '+t).toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  // "Harvest (2009 Remaster)" stays, "Southeastern - Single" loses the suffix
  const clean=t=>t.replace(/ - (Single|EP)$/,'');
  // copyright reads "℗ 2013 Southeastern Records": keep the name
  const label=c=>(c||'').replace(/^[℗©(Pp)\s\d,–-]+/,'').replace(/\.$/,'').trim();
  const big=u=>u.replace(/\/\d+x\d+bb\.(jpg|png)$/,'/1200x1200bb.jpg');

  const PAL=['#8a8178','#f4f2ee','#1a1a1a'];
  // a release from /api/discogs or /api/musicbrainz, shaped like RECORDS
  const fromApi=src=>r=>({...r,src,added:'',pal:PAL,art:'sun',thumb:r.thumb||r.front,slug:slug(r.artist,r.title)});

  // shaped like RECORDS in vinyl-prototype.html; pal is only the fallback before the spine color is read
  function toRecord(a){
    const artist=a.artistName,title=clean(a.collectionName);
    return {src:'a',id:a.collectionId,artist,title,year:+(a.releaseDate||'').slice(0,4)||'',label:label(a.copyright),format:'',added:'',
      pal:['#8a8178','#f4f2ee','#1a1a1a'],art:'sun',front:big(a.artworkUrl100),thumb:a.artworkUrl100.replace(/\/\d+x\d+bb\./,'/300x300bb.'),
      apple:(a.collectionViewUrl||'').split('?')[0],slug:slug(artist,title)};
  }

  // Discogs when the server has a token, then MusicBrainz, then Apple Music
  let discogs=null;
  async function api(src,q){
    const r=await fetch(`/api/${src==='d'?'discogs':'musicbrainz'}?`+q);
    if(src==='d'&&(r.status===503||r.status===404)){discogs=false;return null}
    if(!r.ok)throw new Error(r.status===429?'busy':'failed');
    if(src==='d')discogs=true;
    return r.json();
  }
  async function search(term){
    const q='q='+encodeURIComponent(term);
    if(discogs!==false){
      const d=await api('d',q).catch(e=>{if(discogs)throw e;discogs=false;return null});
      if(d)return d.results.map(r=>({...r,src:'d',pal:PAL}));
    }
    const m=await api('m',q).catch(()=>null);
    if(m)return m.results.map(r=>({...r,src:'m',group:r.id,pal:PAL})); // an album, until pick() chooses its pressing
    const d=await jsonp(ITUNES+'search?media=music&entity=album&limit=24&term='+encodeURIComponent(term));
    return (d.results||[]).filter(a=>a.collectionType==='Album'&&a.artworkUrl100).map(toRecord);
  }
  // the pressing to keep for a MusicBrainz album: its release ID
  async function pick(r){
    const d=await api('m','pick='+r.group);
    if(!d?.id)throw new Error('no release');
    return {...r,id:d.id};
  }
  async function apiLookup(src,ids){
    if(!ids.length)return [];
    const d=await api(src,'ids='+ids.join(','));
    const byId={};(d?.records||[]).forEach(r=>byId[r.id]=fromApi(src)(r));
    return ids.map(id=>byId[id]).filter(Boolean);
  }

  async function appleLookup(ids){
    const byId={};
    for(let i=0;i<ids.length;i+=100){
      const d=await jsonp(ITUNES+'lookup?entity=album&id='+ids.slice(i,i+100).join(','));
      (d.results||[]).filter(a=>a.wrapperType==='collection'&&a.artworkUrl100).forEach(a=>byId[a.collectionId]=toRecord(a));
    }
    return ids.map(id=>byId[id]).filter(Boolean);
  }

  const encode=ids=>ids.map(n=>(+n).toString(36)).join('.');
  const decode=c=>[...new Set((c||'').split('.').map(s=>parseInt(s,36)).filter(n=>n>0))].slice(0,MAX);
  // MusicBrainz IDs are 128-bit: base 36 makes them 25 characters instead of 36
  const encodeM=ids=>ids.map(id=>BigInt('0x'+id.replace(/-/g,'')).toString(36)).join('.');
  const decodeM=c=>[...new Set((c||'').split('.').filter(s=>/^[0-9a-z]{1,25}$/.test(s)).map(s=>{
    let n=0n;for(const ch of s)n=n*36n+BigInt(parseInt(ch,36));
    const h=n.toString(16).padStart(32,'0');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }))].slice(0,MAX);
  // records: [{src:'d'|'a', id}]
  const link=(name,records,page='vinyl-prototype.html')=>{
    const u=new URL(page,location.href),p=new URLSearchParams();
    if(name.trim())p.set('by',name.trim());
    const of=k=>records.filter(r=>(r.src||'a')===k).map(r=>r.id);
    const d=of('d'),m=of('m'),a=of('a');
    if(d.length)p.set('d',encode(d));
    if(m.length)p.set('m',encodeM(m));
    if(a.length)p.set('c',encode(a));
    u.search=p;u.hash='';return u.href;
  };
  // the crate in an address
  const fromAddress=async params=>{
    const all=await Promise.all([apiLookup('d',decode(params.get('d'))),apiLookup('m',decodeM(params.get('m'))),appleLookup(decode(params.get('c')))]);
    return all.flat().slice(0,MAX);
  };
  const crateName=n=>n.trim()?n.trim()+(/s$/i.test(n.trim())?'’':'’s')+' crate':'My crate';

  window.VisitorCrate={MAX,search,pick,fromAddress,link,crateName,};

  // On the crate page: resolves to {name, records} when the address holds a crate, null for Casey's own
  const p=new URLSearchParams(location.search);
  window.visitorCrate=p.get('d')||p.get('m')||p.get('c')?fromAddress(p).then(records=>({name:(p.get('by')||'').slice(0,40),records})):Promise.resolve(null);
})();
