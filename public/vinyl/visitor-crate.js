// Visitor crates: anyone can make a crate at vinyl-make.html and share it as a link,
// vinyl-prototype.html?by=Sam&c=<ids>. c holds Apple Music album IDs in base 36,
// joined by dots, so the whole crate lives in the address: no account, key or database.
// Albums come from the iTunes Search API by JSONP (it works from any origin, localhost too).
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

  // shaped like RECORDS in vinyl-prototype.html; pal is only the fallback before the spine color is read
  function toRecord(a){
    const artist=a.artistName,title=clean(a.collectionName);
    return {id:a.collectionId,artist,title,year:+(a.releaseDate||'').slice(0,4)||'',label:label(a.copyright),format:'',added:'',
      pal:['#8a8178','#f4f2ee','#1a1a1a'],art:'sun',front:big(a.artworkUrl100),thumb:a.artworkUrl100.replace(/\/\d+x\d+bb\./,'/300x300bb.'),
      apple:(a.collectionViewUrl||'').split('?')[0],slug:slug(artist,title)};
  }

  async function search(term){
    const d=await jsonp(ITUNES+'search?media=music&entity=album&limit=24&term='+encodeURIComponent(term));
    return (d.results||[]).filter(a=>a.collectionType==='Album'&&a.artworkUrl100).map(toRecord);
  }

  async function lookup(ids){
    const byId={};
    for(let i=0;i<ids.length;i+=100){
      const d=await jsonp(ITUNES+'lookup?entity=album&id='+ids.slice(i,i+100).join(','));
      (d.results||[]).filter(a=>a.wrapperType==='collection'&&a.artworkUrl100).forEach(a=>byId[a.collectionId]=toRecord(a));
    }
    return ids.map(id=>byId[id]).filter(Boolean);
  }

  const encode=ids=>ids.map(n=>(+n).toString(36)).join('.');
  const decode=c=>[...new Set((c||'').split('.').map(s=>parseInt(s,36)).filter(n=>n>0))].slice(0,MAX);
  const link=(name,ids,page='vinyl-prototype.html')=>{
    const u=new URL(page,location.href),p=new URLSearchParams();
    if(name.trim())p.set('by',name.trim());
    p.set('c',encode(ids));u.search=p;u.hash='';return u.href;
  };
  const crateName=n=>n.trim()?n.trim()+(/s$/i.test(n.trim())?'’':'’s')+' crate':'My crate';

  window.VisitorCrate={MAX,search,lookup,encode,decode,link,crateName};

  // On the crate page: resolves to {name, records} when the address holds a crate, null for Casey's own
  const p=new URLSearchParams(location.search),ids=decode(p.get('c'));
  window.visitorCrate=ids.length?lookup(ids).then(records=>({name:(p.get('by')||'').slice(0,40),records})):Promise.resolve(null);
})();
