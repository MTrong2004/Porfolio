// courseIndex.js - build structured course data from Data2.txt
(function(){
  const SRC = 'Data2.txt';
  const bust = Date.now().toString().slice(-6);
  function parse(lines){
    const list=[]; const byCode={}; const bySemester={}; const overrides={};
    // First pass: detect TSV lines
    lines.forEach(raw=>{
      if(!raw.trim()) return;
      if(/\t/.test(raw)){
        const parts=raw.split(/\t+/);
        if(parts.length>=4){
          const idx=parts[0].trim();
          const code=parts[1].trim();
          const title=parts[2].trim();
          const semester=(parts[3]||'').trim();
          if(code){
            const entry={ index: idx? parseInt(idx,10):null, code, title, semester };
            list.push(entry);
            byCode[code.toUpperCase()]=entry;
            if(semester){ (bySemester[semester] = bySemester[semester]||[]).push(entry); }
          }
        }
      }
    });
    // Second pass: override lines like CODE là Description
    lines.forEach(raw=>{
      const m=/^\s*([A-Za-z0-9]{3,})\s+l[àa]\s+(.+)$/.exec(raw.trim());
      if(m){ overrides[m[1].toUpperCase()] = m[2].trim(); }
    });
    // Apply overrides
    Object.keys(overrides).forEach(code=>{
      if(byCode[code]) byCode[code].title = overrides[code];
      else {
        const entry={ index:null, code, title:overrides[code], semester:null };
        byCode[code]=entry; list.push(entry);
      }
    });
    // Utility helpers
    function search(q){ q=q.toLowerCase(); return list.filter(e=> e.code.toLowerCase().includes(q)|| (e.title && e.title.toLowerCase().includes(q))); }
    function get(code){ return byCode[(code||'').toUpperCase()]||null; }
    return { list, byCode, bySemester, overrides, search, get };
  }
  fetch(SRC+'?v='+bust).then(r=> r.text()).then(txt=>{
    const lines = txt.split(/\r?\n/);
    const idx = parse(lines);
    window.courseIndex = idx;
    window.dispatchEvent(new CustomEvent('courseIndexReady'));
  }).catch(()=>{});
})();
