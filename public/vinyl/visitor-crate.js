// Visitor crates: anyone can make a crate at vinyl-make.html and share it as a link,
// vinyl-prototype.html?by=Sam&d=<ids>. d holds Discogs release IDs in base 36, joined by
// dots, so the whole crate lives in the address: no account or database.
// Records come from Discogs through /api/discogs (vinyl pressings, with backs). Without a
// DISCOGS_TOKEN the builder falls back to Apple Music by JSONP; those albums go in c.
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
  // a Discogs release from /api/discogs, shaped like RECORDS
  const fromDiscogs=r=>({...r,src:'d',added:'',pal:PAL,art:'sun',thumb:r.thumb||r.front,slug:slug(r.artist,r.title)});

  // shaped like RECORDS in vinyl-prototype.html; pal is only the fallback before the spine color is read
  function toRecord(a){
    const artist=a.artistName,title=clean(a.collectionName);
    return {src:'a',id:a.collectionId,artist,title,year:+(a.releaseDate||'').slice(0,4)||'',label:label(a.copyright),format:'',added:'',
      pal:['#8a8178','#f4f2ee','#1a1a1a'],art:'sun',front:big(a.artworkUrl100),thumb:a.artworkUrl100.replace(/\/\d+x\d+bb\./,'/300x300bb.'),
      apple:(a.collectionViewUrl||'').split('?')[0],slug:slug(artist,title)};
  }

  // Discogs when the server has a token, Apple Music otherwise
  let discogs=null;
  async function api(q){
    const r=await fetch('/api/discogs?'+q);
    if(r.status===503||r.status===404){discogs=false;return null}
    if(!r.ok)throw new Error(r.status===429?'busy':'failed');
    discogs=true;return r.json();
  }
  async function search(term){
    if(discogs!==false){
      const d=await api('q='+encodeURIComponent(term)).catch(e=>{if(discogs)throw e;discogs=false;return null});
      if(d)return d.results.map(r=>({...r,src:'d',pal:PAL}));
    }
    const d=await jsonp(ITUNES+'search?media=music&entity=album&limit=24&term='+encodeURIComponent(term));
    return (d.results||[]).filter(a=>a.collectionType==='Album'&&a.artworkUrl100).map(toRecord);
  }
  async function discogsLookup(ids){
    if(!ids.length)return [];
    const d=await api('ids='+ids.join(','));
    const byId={};(d?.records||[]).forEach(r=>byId[r.id]=fromDiscogs(r));
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
  // records: [{src:'d'|'a', id}]
  const link=(name,records,page='vinyl-prototype.html')=>{
    const u=new URL(page,location.href),p=new URLSearchParams();
    if(name.trim())p.set('by',name.trim());
    const d=records.filter(r=>r.src==='d').map(r=>r.id),a=records.filter(r=>r.src!=='d').map(r=>r.id);
    if(d.length)p.set('d',encode(d));
    if(a.length)p.set('c',encode(a));
    u.search=p;u.hash='';return u.href;
  };
  // the crate in an address, Discogs records first
  const fromAddress=async params=>{
    const [d,a]=await Promise.all([discogsLookup(decode(params.get('d'))),appleLookup(decode(params.get('c')))]);
    return [...d,...a].slice(0,MAX);
  };
  const crateName=n=>n.trim()?n.trim()+(/s$/i.test(n.trim())?'’':'’s')+' crate':'My crate';

  window.VisitorCrate={MAX,search,fromAddress,link,crateName,source:()=>discogs===false?'apple':'discogs'};

  // On the crate page: resolves to {name, records} when the address holds a crate, null for Casey's own
  const p=new URLSearchParams(location.search);
  window.visitorCrate=p.get('d')||p.get('c')?fromAddress(p).then(records=>({name:(p.get('by')||'').slice(0,40),records})):Promise.resolve(null);
})();
