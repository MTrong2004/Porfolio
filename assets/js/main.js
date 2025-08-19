// main.js - logic tạo timeline, gallery, filter, form, theme toggle

(function(){
  // Fallback cho requestIdleCallback trên trình duyệt không hỗ trợ
  if(typeof window.requestIdleCallback !== 'function'){
    window.requestIdleCallback = function(cb){ return setTimeout(()=> cb({ didTimeout:false, timeRemaining:()=> 15 }), 1); };
    window.cancelIdleCallback = function(id){ clearTimeout(id); };
  }
  const timelineList = document.getElementById('timelineList');
  // Gallery removed
  // Timeline tối giản chỉ theo thời gian
  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortSelect');
  // Bỏ group mode
  const yearEl = document.getElementById('year');
  const timelineItemTemplate = document.getElementById('timelineItemTemplate');
  // Gallery template removed
  const themeToggle = document.getElementById('themeToggle');
  const contactForm = document.getElementById('contactForm');
  const formStatus = document.getElementById('formStatus');
  const progressBar = document.getElementById('scrollProgressBar');
  const heroMosaic = document.getElementById('heroMosaic');
  const kyNav = document.getElementById('kyNav');
  const FEATURED_KEY = 'timeline_featured_v2';
  let featuredMap = {};
  const subgroupFeatureUpdaters = {}; // key -> function cập nhật UI feature box + thumb highlight
  // Ưu tiên map toàn cục build-time (featured.js cung cấp)
  if(typeof window.getInitialFeaturedMap === 'function'){
    try { featuredMap = window.getInitialFeaturedMap() || {}; } catch(e){ featuredMap={}; }
  }
  // Sau đó merge thêm localStorage (cho phép người chủ site tinh chỉnh trước khi export)
  try {
    const localData = JSON.parse(localStorage.getItem(FEATURED_KEY)||'{}')||{};
    featuredMap = Object.assign({}, featuredMap, localData);
  } catch(e) {}
  function saveFeatured(){
    try{ localStorage.setItem(FEATURED_KEY, JSON.stringify(featuredMap)); }catch(e){}
  }
  // Hàm export JSON gọn để featured.js sử dụng
  window.exportCurrentFeatured = function(){
    return JSON.stringify(featuredMap, null, 2);
  };

  yearEl.textContent = new Date().getFullYear();

  // ========== THEME ========== //
  const PREF_KEY = 'portfolio_theme';
  function applyTheme(theme){
    if(theme === 'light') document.documentElement.classList.add('light');
    else document.documentElement.classList.remove('light');
  }
  const storedTheme = localStorage.getItem(PREF_KEY);
  if(storedTheme) applyTheme(storedTheme);
  themeToggle.addEventListener('click', () => {
    const isLight = document.documentElement.classList.toggle('light');
    localStorage.setItem(PREF_KEY, isLight ? 'light' : 'dark');
  });


  // ========== RENDER ========== //
  function formatDate(dateStr){
    const d = new Date(dateStr + 'T00:00:00');
    if(isNaN(d)) return dateStr;
    return d.toLocaleDateString('vi-VN', {year:'numeric', month:'short', day:'numeric'});
  }

  // ========== THUMBNAIL PATH HELPER ========== //
  function getThumbPath(original){
    // Chuyển assets/images/.../file.ext -> assets/thumbs/.../file.(jpg|png)
    // Script generate-thumbs giữ PNG nếu ảnh có alpha, còn lại xuất JPG.
    if(!original || !original.startsWith('assets/images/')) return original;
    const rel = original.substring('assets/images/'.length);
    const dot = rel.lastIndexOf('.');
    const base = dot>0 ? rel.substring(0,dot) : rel;
    const origExt = dot>0 ? rel.substring(dot+1).toLowerCase() : '';
    if(origExt === 'png'){
      return 'assets/thumbs/' + base + '.png';
    }
    return 'assets/thumbs/' + base + '.jpg';
  }

  function createTimelineItem(entry, idx){
    const node = timelineItemTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.index = idx;
    node.querySelector('time').textContent = formatDate(entry.date);
    const wrapper = node.querySelector('.img-wrapper');
  // Thêm skeleton trước khi ảnh load
  const skel = document.createElement('div'); skel.className='skeleton'; wrapper.appendChild(skel);
  const baseThumb = getThumbPath(entry.img); // always thumb
  const webpCandidate = baseThumb.replace(/\.(jpg|png)$/i, '.webp');
    const fig = wrapper;
    // Dùng <picture> để ưu tiên WebP nếu tồn tại
    wrapper.innerHTML = `<picture>
        <source data-srcset="${webpCandidate}" type="image/webp">
    <img loading="lazy" decoding="async" fetchpriority="low" alt="${entry.title}" class="img-loading" src="${baseThumb}" data-full="${entry.img}" />
      </picture>`;
    const img = wrapper.querySelector('img');
    img.addEventListener('load', ()=>{ img.classList.remove('img-loading'); img.classList.add('img-loaded'); if(skel) skel.remove(); }, {once:true});
    // Fallback: nếu thumbnail không tồn tại (404) thì dùng ảnh gốc để tránh mất hình (đặc biệt Ky1, Ky2 chưa generate thumbs)
    img.addEventListener('error', ()=>{
      if(!img.dataset._triedFull && img.dataset.full){
        img.dataset._triedFull='1';
        img.src = img.dataset.full;
      }
      if(skel) skel.remove();
    }, {once:true});
    node.querySelector('.caption').textContent = entry.title;
    node.querySelector('.title').textContent = entry.title;
    node.querySelector('.desc').textContent = entry.desc || '';
    const tagList = node.querySelector('.tags');
    (entry.tags||[]).slice(0,5).forEach(t=>{ const li=document.createElement('li'); li.textContent=t; tagList.appendChild(li); });
  node.addEventListener('click', ()=> openItemWithContext(entry));
    return node;
  }

  // ====== GROUP RENDER 2 CẤP (Kỳ -> Môn/Thư mục con) ======
  function buildNestedGroups(list){
    // Map Ky => Map Sub => entries
    const kyMap = new Map();
    list.forEach((item, idx)=>{
      const parts = item.img.split('/'); // assets images KyX Sub ...
      const ky = parts[2] || 'Khac';
      const sub = parts[3] || 'Khác';
      if(!kyMap.has(ky)) kyMap.set(ky, new Map());
      const subMap = kyMap.get(ky);
      if(!subMap.has(sub)) subMap.set(sub, []);
      subMap.get(sub).push({item, idx});
    });
    const result = [];
    kyMap.forEach((subMap, ky)=>{
      let allEntries = [];
      const subgroups = [];
      subMap.forEach((arr, sub)=>{
        // sort each subgroup entries newest first
        arr.sort((a,b)=> b.item.date.localeCompare(a.item.date));
        const dates = arr.map(o=>o.item.date).filter(Boolean).sort();
        // subgroup description: most frequent non-empty desc
        let sgDesc='';
        const freq={};
        arr.forEach(o=>{ const d=o.item.desc||''; if(d){ freq[d]=(freq[d]||0)+1; }});
        let max=0; for(const k in freq){ if(freq[k]>max){ max=freq[k]; sgDesc=k; } }
        subgroups.push({
          name: sub,
          key: ky+"/"+sub,
          entries: arr,
          count: arr.length,
          dateFrom: dates[0],
          dateTo: dates[dates.length-1],
          desc: sgDesc
        });
        allEntries = allEntries.concat(arr);
      });
      const datesAll = allEntries.map(o=>o.item.date).filter(Boolean).sort();
      // Lấy mô tả chung nếu >60% entry có desc giống nhau
      let kyDesc = '';
      const descFreq = {};
      allEntries.forEach(e=>{ const d=e.item.desc||''; if(d){ descFreq[d]=(descFreq[d]||0)+1; }});
      const entriesWithDesc = Object.values(descFreq).reduce((a,b)=>a+b,0);
      if(entriesWithDesc>0){
        const threshold = allEntries.length*0.6;
        for(const k in descFreq){ if(descFreq[k] >= threshold){ kyDesc = k; break; }}
      }
      result.push({
        folder: ky,
        entries: allEntries,
        dateFrom: datesAll[0],
        dateTo: datesAll[datesAll.length-1],
        subgroups,
        desc: kyDesc
      });
    });
    return result;
  }

  function createNestedGroupItem(group){
    const li = document.createElement('li');
    li.className = 'timeline-item timeline-group nested-group';
    const range = group.dateFrom === group.dateTo ? formatDate(group.dateTo) : `${formatDate(group.dateFrom)} → ${formatDate(group.dateTo)}`;
    li.innerHTML = `
      <div class="time"><time>${(group.dateTo||group.dateFrom||'').slice(0,4)}</time></div>
      <div class="content">
        <h3 class="title"><span class="ky-badge" id="anchor-${group.folder}">${group.folder}</span> <small>${group.entries.length} ảnh • ${range}</small></h3>
        ${group.desc ? `<p class=\"group-desc\">${group.desc}</p>` : ''}
        <div class="subgroups"></div>
      </div>`;
    const wrap = li.querySelector('.subgroups');
    // sort subgroup by most recent date desc
    group.subgroups.sort((a,b)=> (b.dateTo||'').localeCompare(a.dateTo||''));
    group.subgroups.forEach(sg=>{
      const sgRange = sg.dateFrom === sg.dateTo ? formatDate(sg.dateTo) : `${formatDate(sg.dateFrom)} – ${formatDate(sg.dateTo)}`;
      const div = document.createElement('div');
      div.className = 'subgroup pre-enter';
      div.dataset.course = sg.name; // course code for full description
      div.innerHTML = `
        <header class="subgroup-head">
          <h4 class="subgroup-title">${sg.name} <span class="meta">${sg.count} • ${sgRange}</span></h4>
          <div class="sub-actions"><button type="button" class="toggle" aria-label="Thu gọn / Mở rộng">−</button><button type="button" class="feat-mark" title="Đặt ảnh tiêu biểu" aria-label="Chọn ảnh tiêu biểu">★</button></div>
        </header>
        ${sg.desc ? `<p class=\"sub-desc\">${sg.desc}</p>`: ''}
        <div class="sub-feature" hidden></div>
        <div class="subgroup-thumbs" data-seq="${sg.key}"></div>`;
      const thumbs = div.querySelector('.subgroup-thumbs');
      const featureBox = div.querySelector('.sub-feature');
      sg.entries.forEach(({item},i)=>{
        const btn = document.createElement('button');
        btn.type='button';
        btn.className='thumb';
        btn.title = item.title;
  const tPath = getThumbPath(item.img);
  btn.innerHTML = `<span class=\"thumb-skel\"></span><img class=\"img-loading\" decoding=\"async\" loading=\"lazy\" data-src=\"${tPath}\" data-full=\"${item.img}\" alt=\"${item.title}\" fetchpriority=\"low\">`;
        btn.dataset.seq = sg.key;
        btn.dataset.index = i;
        btn.dataset.img = item.img;
        thumbs.appendChild(btn);
        const ti = btn.querySelector('img');
        const tsi = btn.querySelector('.thumb-skel');
        ti.addEventListener('error', ()=>{
          if(!ti.dataset._triedFull && ti.dataset.full){
            ti.dataset._triedFull='1';
            ti.src = ti.dataset.full; // fallback original
          }
          if(tsi) tsi.remove();
        }, {once:true});
        ti.addEventListener('load', ()=>{ if(tsi) tsi.remove(); ti.classList.add('img-loaded'); }, {once:true});
      });
      const toggleBtn = div.querySelector('.toggle');
      toggleBtn.addEventListener('click', e=>{
        e.stopPropagation();
        const collapsed = div.classList.toggle('collapsed');
        toggleBtn.textContent = collapsed ? '+' : '−';
      });
      function updateFeatured(){
        const chosen = featuredMap[sg.key];
        const btns = Array.from(thumbs.querySelectorAll('.thumb'));
        let target = btns.find(b=> b.dataset.img===chosen);
        if(!target) target = btns[0];
        if(!target){ featureBox.hidden=true; featureBox.innerHTML=''; return; }
        featureBox.hidden=false;
  // Chỉ dùng thumbnail trong timeline (không load ảnh gốc ở UI timeline)
  const thumbSrc = getThumbPath(target.dataset.img);
  featureBox.innerHTML = `<figure><div class="feat-img"><img src="${thumbSrc}" data-full="${target.dataset.img}" alt="Tiêu biểu ${sg.name}" loading="lazy" decoding="async"></div><figcaption>${target.title}</figcaption></figure>`;
        const fImg = featureBox.querySelector('img');
        if(fImg){
          fImg.addEventListener('error', ()=>{
            if(!fImg.dataset._triedFull && fImg.dataset.full){
              fImg.dataset._triedFull='1';
              fImg.src = fImg.dataset.full;
            }
          }, {once:true});
        }
        btns.forEach(b=> b.classList.toggle('is-featured', b===target));
      }
      updateFeatured();
  subgroupFeatureUpdaters[sg.key] = updateFeatured;
      const featBtn = div.querySelector('.feat-mark');
      featBtn.addEventListener('click', ev=>{
        ev.stopPropagation();
        const imgs = Array.from(thumbs.querySelectorAll('.thumb'));
        if(!imgs.length) return;
        const cur = featuredMap[sg.key];
        if(!cur){
          featuredMap[sg.key] = imgs[0].dataset.img;
        } else {
          const idx = imgs.findIndex(b=> b.dataset.img===cur);
            featuredMap[sg.key] = imgs[(idx+1) % imgs.length].dataset.img;
        }
        saveFeatured();
        updateFeatured();
      });
      // Event delegation for thumbnail click
      thumbs.addEventListener('click', e=>{
        const t = e.target.closest('.thumb');
        if(!t) return;
        e.stopPropagation();
        const idx = parseInt(t.dataset.index,10)||0;
        openSequenceAt(sg.key, idx);
      });
      wrap.appendChild(div);
    });
    return li;
  }

  // createGalleryItem removed

  function createYearSeparator(year){
    const li = document.createElement('li');
    li.className = 'timeline-year';
    li.innerHTML = `<div class="year-marker"><span>${year}</span></div>`;
    return li;
  }

  const GROUP_MODE = true; // bật grouping

  // Gallery logic removed

  let lastRenderedList = [];
  function render(list){
    lastRenderedList = list.slice();
    timelineList.innerHTML='';
  // Gallery removed: skip
    if(GROUP_MODE){
      const groups = buildNestedGroups(list);
      // Sort by Ky number ascending if pattern KyX, else fallback alphabetical
      groups.sort((a,b)=>{
        const ra=/Ky(\d+)/i.exec(a.folder); const rb=/Ky(\d+)/i.exec(b.folder);
        if(ra && rb) return parseInt(rb[1]) - parseInt(ra[1]); // DESC
        if(ra) return 1; if(rb) return -1; return b.folder.localeCompare(a.folder);
      });
      buildSequencesFromGroups(groups);
      let lastYear=null;
      // Render theo lô để tránh block main thread nếu nhóm lớn
      let i=0;
      function renderBatch(){
        const slice = groups.slice(i, i+3);
        slice.forEach(g=>{
        const year = (g.dateTo||g.dateFrom||'').slice(0,4);
        if(year && year!==lastYear){
          timelineList.appendChild(createYearSeparator(year));
          lastYear = year;
        }
        timelineList.appendChild(createNestedGroupItem(g));
        if(kyNav){
          const btn=document.createElement('button');
          btn.type='button';
          btn.className='ky-link';
          btn.textContent=g.folder;
          btn.addEventListener('click', ()=>{
            const anchor=document.getElementById('anchor-'+g.folder);
            if(anchor){ anchor.scrollIntoView({behavior:'smooth', block:'start'}); highlightKy(g.folder); }
          });
          kyNav.appendChild(btn);
        }
        });
  // Đảm bảo ảnh (data-src) mới thêm vào batch này được attach lazy observer
  setupLazyLoading();
  if(subjectDescLoaded) applySubjectDescriptions();
        i+=3;
        if(i < groups.length){ requestIdleCallback(renderBatch); }
      }
      renderBatch();
    } else {
      let lastYear=null;
      list.forEach((entry, idx)=>{
        const year = (entry.date||'').slice(0,4);
        if(year && year!==lastYear){
          timelineList.appendChild(createYearSeparator(year));
          lastYear = year;
        }
        timelineList.appendChild(createTimelineItem(entry, idx));
      });
    }
    observeItems();
  // scheduleGalleryLoad removed
    setupLazyLoading();
  if(subjectDescLoaded) applySubjectDescriptions(); else loadSubjectDescriptions();
  // Sau khi render thử prune những ảnh không còn tồn tại (nếu data.js chưa kịp cập nhật)
  schedulePruneMissing();
  activateSubgroupEntrance();
  }

  // ====== PRUNE ẢNH / THƯ MỤC ĐÃ XOÁ (best-effort) ====== //
  let pruneScheduled=false;
  function schedulePruneMissing(){
    if(pruneScheduled) return; pruneScheduled=true;
    // Đợi 1s cho lazy load bắt đầu rồi kiểm tra
    setTimeout(pruneMissingImages, 1000);
  }
  function pruneMissingImages(){
    pruneScheduled=false;
    const thumbs = Array.from(document.querySelectorAll('.subgroup-thumbs img'));
    if(!thumbs.length) return;
    let pending=0; const toRemove=[]; const LIMIT=40; // giới hạn kiểm tra để tránh quá tải
    thumbs.slice(0,LIMIT).forEach(img=>{
      if(img.dataset._checked) return; img.dataset._checked='1';
      // Nếu đã load ok thì bỏ qua
      if(img.complete && img.naturalWidth>0) return;
      pending++;
      const test = new Image();
      test.onload = ()=>{ if(--pending===0) finalizePrune(); };
      test.onerror = ()=>{ toRemove.push(img); if(--pending===0) finalizePrune(); };
      test.src = img.getAttribute('data-full') || img.src;
    });
    if(pending===0) finalizePrune();
    function finalizePrune(){
      if(!toRemove.length) return;
      const removedImgs = [];
      toRemove.forEach(img=>{
        const full = img.getAttribute('data-full') || img.src;
        removedImgs.push(full);
        const btn = img.closest('.thumb');
        if(btn){
          const wrap = btn.closest('.subgroup-thumbs');
          btn.remove();
          // Nếu subgroup rỗng -> xoá subgroup
          if(wrap && !wrap.querySelector('.thumb')){
            const sg = wrap.closest('.subgroup');
            if(sg){
              const groupLi = sg.closest('.timeline-item');
              sg.remove();
              if(groupLi && !groupLi.querySelector('.subgroup')){
                groupLi.remove();
              }
            }
          }
        }
      });
      // Cập nhật dữ liệu toàn cục để nhóm biến mất vĩnh viễn nếu ảnh đã xoá khỏi server
      if(Array.isArray(window.artworks) && removedImgs.length){
        const set = new Set(removedImgs);
        window.artworks = window.artworks.filter(a=> !set.has(a.img));
        // Xoá trạng thái featured cho các subgroup không còn ảnh
        Object.keys(featuredMap).forEach(k=>{
          if(!sequences[k] || !sequences[k].some(it=> !set.has(it.img))) delete featuredMap[k];
        });
      }
      rebuildKyNav();
    }
  }
  function rebuildKyNav(){
    if(!kyNav) return; kyNav.innerHTML='';
    document.querySelectorAll('.ky-badge').forEach(b=>{
      const ky = b.textContent;
      const btn=document.createElement('button'); btn.type='button'; btn.className='ky-link'; btn.textContent=ky;
      btn.addEventListener('click', ()=>{ const anchor=document.getElementById('anchor-'+ky); if(anchor){ anchor.scrollIntoView({behavior:'smooth', block:'start'}); highlightKy(ky); }});
      kyNav.appendChild(btn);
    });
  }
  function activateSubgroupEntrance(){
    const nodes = Array.from(document.querySelectorAll('.subgroup.pre-enter'));
    if(!nodes.length) return;
    const io = new IntersectionObserver(entries=>{
      entries.forEach(en=>{
        if(en.isIntersecting){
          en.target.classList.remove('pre-enter');
          void en.target.offsetWidth; // reflow
          en.target.classList.add('entered');
          io.unobserve(en.target);
        }
      });
    }, {threshold:0.1, rootMargin:'200px 0px -5% 0px'});
    nodes.forEach(n=> io.observe(n));
    // Fallback: nếu sau 2.5s vẫn chưa xuất hiện (ví dụ do content-visibility) thì force hiện
    setTimeout(()=>{
      document.querySelectorAll('.subgroup.pre-enter').forEach(el=>{
        el.classList.remove('pre-enter');
        el.classList.add('entered');
      });
    }, 2500);
  }
  function highlightKy(ky){
    if(!ky) return;
    if(kyNav){ Array.from(kyNav.querySelectorAll('.ky-link')).forEach(b=> b.classList.toggle('active', b.textContent===ky)); }
    const anchor=document.getElementById('anchor-'+ky);
    if(anchor){ const li=anchor.closest('.timeline-item'); if(li){ li.classList.add('ky-flash'); setTimeout(()=> li.classList.remove('ky-flash'), 1400); } }
  }

  // ====== SEQUENCE NAV ======
  let sequences = {}; let currentSeqKey=null; let currentSeqIndex=0;
  // Subject (course) detailed descriptions from Data2.txt
  let subjectDescMap=null, subjectDescLoaded=false, subjectDescLoading=false;
  function parseSubjectDescriptions(text){
    const map={}; const lines=text.split(/\r?\n/);
    const hasBracketStyle = lines.some(l=> /^\s*\[.+?\]\s*$/.test(l));
    const hasTabs = lines.some(l=> /\t/.test(l));
    if(hasBracketStyle){
      let cur=null; let buf=[]; function commit(){ if(cur){ const content=buf.join('\n').trim(); if(content) map[cur.toUpperCase()]=content; buf=[]; } }
      for(const raw of lines){ const line=raw.trimEnd(); if(/^;|^#/.test(line)) continue; if(!line.trim()){ buf.push(''); continue; } const m=/^\[(.+?)\]$/.exec(line.trim()); if(m){ commit(); cur=m[1].trim(); continue; } buf.push(line); }
      commit();
    }
    if(hasTabs){
      lines.forEach(raw=>{ if(!raw.trim()) return; const parts=raw.split(/\t+/); if(parts.length>=3){ const code=parts[1].trim(); if(!code) return; const desc=parts[2].trim(); map[code.toUpperCase()]=desc; } });
    }
    // Lines like CODE: desc or CODE - desc
    lines.forEach(raw=>{ const m=/^([A-Z0-9]{3,})\s*[:\-]\s*(.+)$/.exec(raw.trim()); if(m) map[m[1].toUpperCase()]=m[2]; });
    // Lines like CODE là desc / CODE la desc
    lines.forEach(raw=>{ const m=/^([A-Za-z0-9]{3,})\s+l[àa]\s+(.+)$/.exec(raw.trim()); if(m) map[m[1].toUpperCase()]=m[2].trim(); });
    return map;
  }
  function applySubjectDescriptions(){ if(!subjectDescMap) return; document.querySelectorAll('.subgroup').forEach(div=>{ const code=div.dataset.course; if(!code) return; if(div.querySelector('.course-desc-full')) return; const full=subjectDescMap[code] || subjectDescMap[code.toUpperCase()]; if(!full) return; const cont=document.createElement('div'); cont.className='course-desc-full'; cont.innerHTML=full.split(/\n{2,}/).map(b=>`<p>${b.replace(/\n+/g,'<br>')}</p>`).join(''); const head=div.querySelector('.subgroup-head'); if(head) head.insertAdjacentElement('afterend', cont); else div.prepend(cont); }); }
  function applyCourseIndexDescriptions(){
    if(!window.courseIndex) return;
    document.querySelectorAll('.subgroup').forEach(div=>{
      const code=div.dataset.course; if(!code) return;
      if(div.querySelector('.course-desc-full')) return;
      const entry = window.courseIndex.get(code);
      if(!entry) return;
      const cont=document.createElement('div');
      cont.className='course-desc-full';
      cont.innerHTML = `<p><strong>${entry.code}</strong>: ${entry.title}${entry.semester?` (Kỳ ${entry.semester})`:''}</p>`;
      const head=div.querySelector('.subgroup-head');
      if(head) head.insertAdjacentElement('afterend', cont); else div.prepend(cont);
    });
  }
  function loadSubjectDescriptions(){ if(subjectDescLoaded||subjectDescLoading) return; subjectDescLoading=true; const bust=Date.now().toString().slice(-6); fetch('Data2.txt?v='+bust).then(r=>r.text()).then(txt=>{ subjectDescMap=parseSubjectDescriptions(txt); subjectDescLoaded=true; applySubjectDescriptions(); applyCourseIndexDescriptions(); }).catch(()=>{ subjectDescLoaded=true; }); }
  function openItemWithContext(item){
    // Thử suy ra subgroup key từ đường dẫn
    try {
      if(item && item.img){
        const parts = item.img.split('/');
        const ky = parts[2]; const sub = parts[3];
        const key = ky && sub ? ky+"/"+sub : null;
        if(key && sequences[key]){
          const idx = sequences[key].findIndex(it=> it.img===item.img);
          if(idx>=0){ openSequenceAt(key, idx); return; }
        }
      }
    } catch(e) {}
    // Fallback: tạo sequence phẳng từ danh sách đang hiển thị
    if(!sequences.__flat){ sequences.__flat = lastRenderedList.slice(); }
    else { sequences.__flat = lastRenderedList.slice(); }
    const idxFlat = sequences.__flat.findIndex(it=> it.img===item.img);
    if(idxFlat>=0){ openSequenceAt('__flat', idxFlat); return; }
    // Nếu vẫn không tìm được thì mở đơn lẻ
    openLightbox(item);
  }
  function buildSequencesFromGroups(groups){
    sequences={};
    groups.forEach(g=> g.subgroups.forEach(sg=>{ sequences[sg.key]= sg.entries.map(e=>e.item); }));
  }
  function openSequenceAt(key, index){
    if(!sequences[key]) return;
    currentSeqKey=key; currentSeqIndex=Math.min(Math.max(index,0), sequences[key].length-1);
    openLightbox(sequences[key][currentSeqIndex]);
    updateLightboxNav();
  }
  function nextImage(){ if(!currentSeqKey) return; if(currentSeqIndex < sequences[currentSeqKey].length-1){ currentSeqIndex++; openLightbox(sequences[currentSeqKey][currentSeqIndex]); updateLightboxNav(); } }
  function prevImage(){ if(!currentSeqKey) return; if(currentSeqIndex>0){ currentSeqIndex--; openLightbox(sequences[currentSeqKey][currentSeqIndex]); updateLightboxNav(); } }
  function updateLightboxNav(){
    if(!lightboxEl) return;
    const info = lightboxEl.querySelector('.lb-nav-info');
    if(!info || !currentSeqKey){ if(info) info.textContent=''; return; }
    const arr = sequences[currentSeqKey];
    info.textContent = `${currentSeqIndex+1} / ${arr.length}`;
  }

  // Lightbox đơn giản
  let lightboxEl;
  let currentZoomScale = 1; // incremental scale in original mode
  const MIN_ZOOM = 0.25; const MAX_ZOOM = 6; const ZOOM_STEP = 0.2;
  function ensureLightbox(){
    if(lightboxEl) return lightboxEl;
    lightboxEl = document.createElement('div');
    lightboxEl.className = 'lightbox hidden';
    lightboxEl.innerHTML = `<div class="lb-backdrop"></div><div class="lb-dialog" role="dialog" aria-modal="true">
    <button class="lb-close" aria-label="Đóng">×</button>
    <div class="lb-zoom-tools">
      <button class="lb-zoom" aria-label="Chế độ phóng to (chu kỳ)">⤢</button>
      <button class="lb-zoom-in" aria-label="Phóng to thêm" disabled>＋</button>
      <button class="lb-zoom-out" aria-label="Thu nhỏ" disabled>－</button>
      <button class="lb-reset" aria-label="Reset zoom" disabled>⟳</button>
    </div>
    <button class="lb-feature" aria-label="Đánh dấu tiêu biểu" title="Đánh dấu tiêu biểu">☆</button>
    <button class="lb-nav-btn prev" aria-label="Ảnh trước">‹</button><button class="lb-nav-btn next" aria-label="Ảnh tiếp">›</button>
    <figure class="lb-figure"><img alt=""/><figcaption class="lb-cap"></figcaption></figure><div class="lb-meta"><span class="lb-nav-info"></span></div><div class="lb-strip"><div class="lb-strip-inner"></div></div></div>`;
    document.body.appendChild(lightboxEl);
    lightboxEl.addEventListener('click', e=>{ if(e.target.classList.contains('lb-backdrop')|| e.target.classList.contains('lb-close')) closeLightbox(); });
    lightboxEl.querySelector('.lb-nav-btn.prev').addEventListener('click', e=>{ e.stopPropagation(); prevImage(); });
    lightboxEl.querySelector('.lb-nav-btn.next').addEventListener('click', e=>{ e.stopPropagation(); nextImage(); });
    lightboxEl.querySelector('.lb-zoom').addEventListener('click', e=>{ e.stopPropagation(); toggleZoom(); });
    lightboxEl.querySelector('.lb-zoom-in').addEventListener('click', e=>{ e.stopPropagation(); stepZoom(1); });
    lightboxEl.querySelector('.lb-zoom-out').addEventListener('click', e=>{ e.stopPropagation(); stepZoom(-1); });
    lightboxEl.querySelector('.lb-reset').addEventListener('click', e=>{ e.stopPropagation(); resetZoomScale(); });
    lightboxEl.querySelector('.lb-feature').addEventListener('click', e=>{ e.stopPropagation(); toggleFeaturedFromLightbox(); });
    window.addEventListener('keydown', e=>{
      if(lightboxEl.classList.contains('hidden')) return;
      if(e.key==='ArrowRight') nextImage();
      else if(e.key==='ArrowLeft') prevImage();
      else if(e.key==='Escape') closeLightbox();
      else if(e.key===" ") { e.preventDefault(); toggleZoom(); }
      else if(e.key==='f' || e.key==='F'){ e.preventDefault(); toggleFeaturedFromLightbox(); }
      else if(e.key==='+' || e.key==='='){ if(isOriginalMode()) { e.preventDefault(); stepZoom(1);} }
      else if(e.key==='-'){ if(isOriginalMode()) { e.preventDefault(); stepZoom(-1);} }
      else if(e.key==='0'){ if(isOriginalMode()){ e.preventDefault(); resetZoomScale(); } }
    });
    // Wheel zoom in original mode
    lightboxEl.addEventListener('wheel', e=>{
      if(!isOriginalMode()) return;
      if(e.ctrlKey) return; // giữ hành vi ctrl+wheel cũ toggle
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      stepZoom(delta>0 ? -1 : 1, e);
    }, {passive:false});
    // Drag to pan in original mode when scaled
    let isDragging=false; let startX=0; let startY=0; let scrollLeft=0; let scrollTop=0;
    lightboxEl.addEventListener('mousedown', e=>{
      if(!isOriginalMode()) return; const fig=lightboxEl.querySelector('.lb-figure');
      if(e.target.tagName!=='IMG') return; isDragging=true; startX=e.pageX; startY=e.pageY; scrollLeft=fig.scrollLeft; scrollTop=fig.scrollTop; fig.classList.add('panning');
    });
    window.addEventListener('mouseup', ()=>{ isDragging=false; const fig=lightboxEl.querySelector('.lb-figure'); if(fig) fig.classList.remove('panning'); });
    window.addEventListener('mousemove', e=>{ if(isDragging){ const fig=lightboxEl.querySelector('.lb-figure'); fig.scrollLeft = scrollLeft - (e.pageX-startX); fig.scrollTop = scrollTop - (e.pageY-startY); }});
    // Pinch zoom
    let pinchStartDist=null; let pinchStartScale=1;
    lightboxEl.addEventListener('touchstart', e=>{
      if(!isOriginalMode()) return; if(e.touches.length===2){ pinchStartDist=touchDist(e.touches); pinchStartScale=currentZoomScale; }
    }, {passive:true});
    lightboxEl.addEventListener('touchmove', e=>{
      if(!isOriginalMode()) return; if(e.touches.length===2 && pinchStartDist){ e.preventDefault(); const d=touchDist(e.touches); const ratio=d/pinchStartDist; applyZoomScale(clamp(pinchStartScale*ratio)); }
    }, {passive:false});
    lightboxEl.addEventListener('touchend', ()=>{ pinchStartDist=null; });
    return lightboxEl;
  }
  function touchDist(touches){ const [a,b]=[touches[0], touches[1]]; const dx=a.clientX-b.clientX; const dy=a.clientY-b.clientY; return Math.hypot(dx,dy); }
  function clamp(v){ return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v)); }
  function isOriginalMode(){ return lightboxEl && lightboxEl.classList.contains('zoomed') && lightboxEl.classList.contains('zoom-original'); }
  function applyZoomScale(scale){ currentZoomScale = clamp(scale); const img = lightboxEl.querySelector('.lb-figure img'); img.style.transform = `scale(${currentZoomScale})`; updateZoomButtons(); updateScaleInfo(); }
  function stepZoom(dir){ if(!isOriginalMode()) return; applyZoomScale(currentZoomScale + dir*ZOOM_STEP); }
  function resetZoomScale(){ applyZoomScale(1); }
  function updateZoomButtons(){ if(!lightboxEl) return; const inBtn=lightboxEl.querySelector('.lb-zoom-in'); const outBtn=lightboxEl.querySelector('.lb-zoom-out'); const resetBtn=lightboxEl.querySelector('.lb-reset'); const active=isOriginalMode(); [inBtn,outBtn,resetBtn].forEach(b=> b.disabled = !active); if(active){ inBtn.disabled = currentZoomScale>=MAX_ZOOM; outBtn.disabled = currentZoomScale<=MIN_ZOOM; resetBtn.disabled = currentZoomScale===1; } }
  function refreshLightboxFeatureState(item){
    if(!lightboxEl) return;
    const btn = lightboxEl.querySelector('.lb-feature');
    if(!btn) return;
    if(currentSeqKey){
      const cur = featuredMap[currentSeqKey];
      const active = cur === item.img;
      btn.classList.toggle('active', active);
      btn.textContent = active ? '★' : '☆';
      btn.disabled = false;
    } else {
      btn.classList.remove('active');
      btn.textContent='☆';
      btn.disabled = true; // không thuộc subgroup
    }
  }
  function toggleFeaturedFromLightbox(){
    if(!currentSeqKey) return; // chỉ cho sequence
    const arr = sequences[currentSeqKey];
    if(!arr) return;
    const item = arr[currentSeqIndex];
    if(!item) return;
    if(featuredMap[currentSeqKey] === item.img){
      delete featuredMap[currentSeqKey];
    } else {
      featuredMap[currentSeqKey] = item.img;
    }
    saveFeatured();
    // cập nhật subgroup tại timeline
    if(subgroupFeatureUpdaters[currentSeqKey]) subgroupFeatureUpdaters[currentSeqKey]();
    refreshLightboxFeatureState(item);
  }
  function openLightbox(item){
    const el = ensureLightbox();
    const mainImg = el.querySelector('img');
    mainImg.style.transform='';
    mainImg.removeAttribute('width'); mainImg.removeAttribute('height');
    mainImg.src = item.img;
    mainImg.alt = item.title;
    mainImg.onload = ()=>{
      const w=mainImg.naturalWidth, h=mainImg.naturalHeight;
      if(w && h && w<400 && h<400){ // auto upscale very small images for visibility
        mainImg.style.imageRendering='pixelated';
        mainImg.style.transform='scale(1.5)';
      } else {
        mainImg.style.imageRendering='';
      }
    };
    el.querySelector('.lb-cap').textContent = item.title;
  // meta giữ lại nav info container
  updateLightboxNav();
  refreshLightboxFeatureState(item);
    el.classList.remove('hidden');
    document.body.style.overflow='hidden';
  // Reset zoom state mỗi lần mở
  el.classList.remove('zoomed','zoom-original');
  updateScaleInfo();
  }
  function closeLightbox(){
    if(!lightboxEl) return;
    lightboxEl.classList.add('hidden');
    document.body.style.overflow='';
    currentSeqKey=null; currentSeqIndex=0;
    lightboxEl.classList.remove('zoomed');
  }

  // ====== LIGHTBOX STRIP & ZOOM ======
  let stripKey=null;
  function buildStrip(key){
    const el = ensureLightbox();
    const wrap = el.querySelector('.lb-strip-inner');
    if(stripKey===key){ updateStripActive(); return; }
    wrap.innerHTML='';
    stripKey=key;
    const arr = sequences[key]||[];
    arr.forEach((it,i)=>{
      const b=document.createElement('button');
      b.className='lb-thumb';
  // Dùng thumbnail để giảm decode lớn trong strip
  const thumb = getThumbPath(it.img);
  b.innerHTML=`<img src="${thumb}" alt="${it.title}" loading="lazy" data-full="${it.img}">`;
      const ti = b.querySelector('img');
      ti.onerror = ()=>{ ti.onerror=null; ti.src = ti.dataset.full; };
      b.addEventListener('click', e=>{ e.stopPropagation(); openSequenceAt(key,i); });
      wrap.appendChild(b);
    });
    updateStripActive();
  }
  function updateStripActive(){
    if(!lightboxEl || !currentSeqKey) return;
    const thumbs = lightboxEl.querySelectorAll('.lb-thumb');
    thumbs.forEach((t,i)=>{
      t.classList.toggle('current', i===currentSeqIndex);
      t.classList.toggle('future', i>currentSeqIndex);
      t.classList.toggle('past', i<currentSeqIndex);
    });
    const cur = lightboxEl.querySelector('.lb-thumb.current');
    if(cur){ cur.scrollIntoView({block:'nearest', inline:'center', behavior:'smooth'}); }
  }
  function toggleZoom(){
    if(!lightboxEl) return;
    const hasZoom = lightboxEl.classList.contains('zoomed');
    if(!hasZoom){
      lightboxEl.classList.add('zoomed'); // fit contain
      lightboxEl.classList.remove('zoom-original');
    } else if(!lightboxEl.classList.contains('zoom-original')){
      lightboxEl.classList.add('zoom-original'); // original size scrollable
      currentZoomScale = 1; const img = lightboxEl.querySelector('.lb-figure img'); if(img) img.style.transform='scale(1)';
    } else {
      lightboxEl.classList.remove('zoomed','zoom-original'); // back to normal inline size
      currentZoomScale = 1; const img = lightboxEl.querySelector('.lb-figure img'); if(img) img.style.transform='';
    }
    const active = lightboxEl.classList.contains('zoomed');
    document.body.style.overflow = active ? 'hidden' : '';
    updateScaleInfo();
    updateZoomButtons();
  }

  // Patch sequence open to also build strip
  const _openSequenceAt = openSequenceAt;
  openSequenceAt = function(key,index){
    _openSequenceAt(key,index);
    buildStrip(key);
    updateStripActive();
  };

  // Double click to toggle zoom on image area
  document.addEventListener('click', e=>{
    if(!lightboxEl || lightboxEl.classList.contains('hidden')) return;
    if(e.detail === 2){ // double click
      const img = lightboxEl.querySelector('.lb-dialog img');
      if(img && img.contains(e.target)) toggleZoom();
    }
  });
  // Ctrl + wheel to toggle zoom quickly
  document.addEventListener('wheel', e=>{
    if(!lightboxEl || lightboxEl.classList.contains('hidden')) return;
    if(e.ctrlKey){ e.preventDefault(); toggleZoom(); }
  }, {passive:false});

  // Scale info helpers
  function ensureScaleInfo(){
    if(!lightboxEl) return null;
    let span = lightboxEl.querySelector('.lb-scale');
    if(!span){
      const meta = lightboxEl.querySelector('.lb-meta');
      span = document.createElement('span');
      span.className='lb-scale';
      meta.appendChild(span);
    }
    return span;
  }
  function updateScaleInfo(){
    if(!lightboxEl || lightboxEl.classList.contains('hidden')) return;
    const img = lightboxEl.querySelector('.lb-figure img');
    const span = ensureScaleInfo();
    if(!img || !span) return;
    requestAnimationFrame(()=>{
      const natW = img.naturalWidth||0;
      const box = img.getBoundingClientRect();
      let pct = 100;
      if(natW && box.width) pct = (box.width / natW)*100;
      const mode = lightboxEl.classList.contains('zoom-original') ? 'Gốc' : (lightboxEl.classList.contains('zoomed') ? 'Vừa' : 'Chuẩn');
  const scaleTxt = isOriginalMode() && currentZoomScale!==1 ? ` x${currentZoomScale.toFixed(2)}` : '';
  span.textContent = `${mode} ${pct.toFixed(0)}%${scaleTxt}`;
    });
  }
  document.addEventListener('keydown', e=>{
    if(!lightboxEl || lightboxEl.classList.contains('hidden')) return;
    if(e.key==='0'){ lightboxEl.classList.remove('zoomed','zoom-original'); updateScaleInfo(); }
  });

  // ====== LAZY LOAD ======
  function setupLazyLoading(){
    const imgs = document.querySelectorAll('img[data-src]');
    if(!('IntersectionObserver' in window)){ imgs.forEach(i=>{ i.src=i.dataset.src; i.removeAttribute('data-src'); }); return; }
    const io = new IntersectionObserver(entries=>{
      entries.forEach(en=>{
        if(en.isIntersecting){ 
          const img=en.target; 
          // fallback nếu lỗi
          img.onerror = ()=>{
            if(img.dataset.full){ img.src = img.dataset.full; }
            img.onerror=null;
            const p=img.parentElement; if(p){ const sk=p.querySelector('.thumb-skel,.skeleton'); if(sk) sk.remove(); }
          };
          img.addEventListener('load', ()=>{ img.classList.remove('img-loading'); img.classList.add('img-loaded'); const p=img.parentElement; if(p){ const sk=p.querySelector('.thumb-skel,.skeleton'); if(sk) sk.remove(); } }, {once:true});
          img.src=img.dataset.src; 
          img.removeAttribute('data-src'); 
          io.unobserve(img);
        } 
      });
    }, {rootMargin:'200px 0px'});
    imgs.forEach(i=> io.observe(i));
  }

  // ========== FILTER + SORT + SEARCH ========== //
  function getFiltered(){
    let list = [...window.artworks];
    const q = searchInput.value.trim().toLowerCase();
    if(q){
      list = list.filter(a => a.title.toLowerCase().includes(q) || (a.desc && a.desc.toLowerCase().includes(q)));
    }
    const sort = sortSelect.value;
    list.sort((a,b)=> sort==='newest' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
    return list;
  }

  // Debounce tìm kiếm để giảm render liên tục khi gõ
  function debounce(fn, delay=250){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=> fn(...args), delay); }; }
  if(searchInput){ searchInput.addEventListener('input', debounce(()=> render(getFiltered()), 260)); }
  if(sortSelect){ sortSelect.addEventListener('change', ()=> render(getFiltered())); }

  // ========== INTERSECTION ANIMATION ========== //
  let observer;
  function observeItems(){
    if(observer) observer.disconnect();
    const items = Array.from(document.querySelectorAll('.timeline-item'));
    // Stagger delay (giới hạn) để tránh quá nhiều inline style => giảm style calc khi cuộn
    const STAGGER_LIMIT = 24;
    items.forEach((el,i)=>{
      if(i < STAGGER_LIMIT) el.style.transitionDelay = (i*55)+'ms'; else el.style.transitionDelay='0ms';
      el.classList.add('pre-observe');
    });
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          entry.target.classList.add('visible');
          entry.target.classList.remove('pre-observe');
          entry.target.addEventListener('transitionend', function onT(ev){
            if(ev.propertyName==='transform' || ev.propertyName==='opacity'){
              entry.target.style.transitionDelay='';
              entry.target.removeEventListener('transitionend', onT);
            }
          });
          observer.unobserve(entry.target);
        }
      });
    }, {threshold: 0.35, rootMargin:'0px 0px -10% 0px'});
    items.forEach(item => observer.observe(item));
  }

  // ========== CONTACT FORM VALIDATION (client) ========== //
  function validateField(input){
    const errorSpan = document.querySelector(`.error[data-for="${input.name}"]`);
    let msg = '';
    if(input.hasAttribute('required') && !input.value.trim()) msg = 'Không được để trống';
    else if(input.name === 'email'){ 
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if(!emailRegex.test(input.value.trim())) msg = 'Email không hợp lệ';
    } else if(input.hasAttribute('minlength')){
      const min = parseInt(input.getAttribute('minlength'),10);
      if(input.value.trim().length < min) msg = `Tối thiểu ${min} ký tự`;
    }
    errorSpan.textContent = msg;
    return !msg;
  }

  contactForm.addEventListener('submit', e => {
    e.preventDefault();
    const fields = ['name','email','message'].map(id => contactForm.querySelector('#'+id));
    const allValid = fields.every(validateField);
    if(!allValid){
      formStatus.textContent = 'Vui lòng sửa lỗi trong form.';
      formStatus.style.color = 'var(--danger)';
      return;
    }
    formStatus.textContent = 'Đang gửi (giả lập)...';
    formStatus.style.color = 'var(--accent)';
    setTimeout(() => {
      formStatus.textContent = 'Đã gửi! Cảm ơn bạn.';
      formStatus.style.color = 'var(--accent)';
      contactForm.reset();
    }, 900);
  });

  contactForm.querySelectorAll('input,textarea').forEach(inp => {
    inp.addEventListener('blur', () => validateField(inp));
  });

  // ========== INIT ========== //
  render(getFiltered());
  window.addEventListener('courseIndexReady', ()=>{ applyCourseIndexDescriptions(); });

  // Cho phép script khác (autorefresh) cập nhật danh sách mà không reload trang
  window.__refreshArtworks = function(){
    try { render(getFiltered()); }
    catch(e){ console.warn('Không thể refresh artworks:', e); }
  };
  // Xoá cưỡng bức các nhóm Kỳ (ví dụ: removeKyGroups(['Ky6','Ky7'])) rồi render lại
  window.removeKyGroups = function(kys){
    if(!Array.isArray(kys) || !kys.length) return;
    const set = new Set(kys.map(s=>s.toLowerCase()));
    if(Array.isArray(window.artworks)){
      window.artworks = window.artworks.filter(a=>{
        const parts = a.img.split('/');
        const ky = parts[2]||''; return !set.has(ky.toLowerCase());
      });
      window.__refreshArtworks();
    }
  };

  // ====== PERFORMANCE REPORT (debug) ====== //
  window.perfReport = function(){
    const res = performance.getEntriesByType('resource');
    const imgs = res.filter(r=> /\.(png|jpe?g|webp)$/i.test(r.name));
    const originals = imgs.filter(r=> r.name.includes('/assets/images/'));
    const thumbs = imgs.filter(r=> r.name.includes('/assets/thumbs/'));
    const sum = list => list.reduce((a,b)=> a + (b.transferSize||0),0);
    const fmt = n => (n/1024).toFixed(1)+'KB';
    return {
      totalImages: imgs.length,
      originals: {count: originals.length, transfer: fmt(sum(originals))},
      thumbs: {count: thumbs.length, transfer: fmt(sum(thumbs))},
      thumbShare: ((sum(thumbs)/(sum(originals)+sum(thumbs)||1))*100).toFixed(1)+'%'
    };
  };

  // ====== SERVICE WORKER PWA ====== //
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('sw.js').catch(()=>{});
    });
  }

  // Scroll progress
  let scrollEaseTimer=null;
  function updateScrollProgress(){
    if(!progressBar) return;
    const h = document.documentElement;
    const scrolled = (h.scrollTop)/(h.scrollHeight - h.clientHeight);
    progressBar.style.width = (scrolled*100).toFixed(2)+'%';
    document.body.classList.add('scrolling');
    if(scrollEaseTimer) clearTimeout(scrollEaseTimer);
    scrollEaseTimer = setTimeout(()=> document.body.classList.remove('scrolling'), 140);
  }
  window.addEventListener('scroll', updateScrollProgress, {passive:true});
  updateScrollProgress();

  // ScrollSpy
  const spyLinks = Array.from(document.querySelectorAll('a[data-spy]'));
  const sections = spyLinks.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const spyObserver = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if(en.isIntersecting){
        const id = '#'+en.target.id;
        spyLinks.forEach(l=> l.classList.toggle('active', l.getAttribute('href')===id));
      }
    });
  }, {threshold:0.45});
  sections.forEach(sec => spyObserver.observe(sec));

  // Hero mosaic dynamic tiles
  if(heroMosaic && heroMosaic.children.length===0){
    const total = 36; // 6x6
    for(let i=0;i<total;i++){
      const span=document.createElement('span');
      const hue = 220 + Math.random()*140; // cool to warm range
      const sat = 50+Math.random()*40;
      const light = 35+Math.random()*30;
      span.style.background = `linear-gradient(135deg, hsl(${hue} ${sat}% ${light}%), hsl(${(hue+40)%360} ${sat-15}% ${light+15}%))`;
      span.style.animationDelay = (Math.random()*5).toFixed(2)+'s';
      heroMosaic.appendChild(span);
    }
  }

  // ====== MOBILE NAV ====== //
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.querySelector('.main-nav');
  if(navToggle && mainNav){
    function closeMenu(){
      mainNav.classList.remove('open');
      document.body.classList.remove('menu-open');
      navToggle.setAttribute('aria-expanded','false');
    }
    function openMenu(){
      mainNav.classList.add('open');
      document.body.classList.add('menu-open');
      navToggle.setAttribute('aria-expanded','true');
    }
    navToggle.addEventListener('click', ()=>{
      const isOpen = mainNav.classList.toggle('open');
      document.body.classList.toggle('menu-open', isOpen);
      navToggle.setAttribute('aria-expanded', isOpen?'true':'false');
    });
    mainNav.addEventListener('click', e=>{
      if(e.target.matches('a')) closeMenu();
    });
    window.addEventListener('resize', ()=>{ if(window.innerWidth>640) closeMenu(); });
    window.addEventListener('keydown', e=>{ if(e.key==='Escape') closeMenu(); });
  }
})();
