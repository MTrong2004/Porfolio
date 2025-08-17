// main.js - logic tạo timeline, gallery, filter, form, theme toggle

(function(){
  const timelineList = document.getElementById('timelineList');
  const galleryGrid = document.getElementById('galleryGrid');
  // Timeline tối giản chỉ theo thời gian
  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortSelect');
  // Bỏ group mode
  const yearEl = document.getElementById('year');
  const timelineItemTemplate = document.getElementById('timelineItemTemplate');
  const galleryItemTemplate = document.getElementById('galleryItemTemplate');
  const themeToggle = document.getElementById('themeToggle');
  const perfToggle = document.getElementById('perfToggle');
  const contactForm = document.getElementById('contactForm');
  const formStatus = document.getElementById('formStatus');
  const progressBar = document.getElementById('scrollProgressBar');
  const heroMosaic = document.getElementById('heroMosaic');
  const kyNav = document.getElementById('kyNav');
  const FEATURED_KEY = 'timeline_featured_v2';
  let featuredMap={};
  const subgroupFeatureUpdaters = {}; // key -> function cập nhật UI feature box + thumb highlight
  try{ featuredMap = JSON.parse(localStorage.getItem(FEATURED_KEY)||'{}')||{}; }catch(e){ featuredMap={}; }
  function saveFeatured(){ try{ localStorage.setItem(FEATURED_KEY, JSON.stringify(featuredMap)); }catch(e){} }

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

  // ========== PERFORMANCE MODE ========== //
  const PERF_KEY='portfolio_perf_mode';
  let perfMode = localStorage.getItem(PERF_KEY)==='1';
  function applyPerfMode(on){
    document.documentElement.classList.toggle('perf-mode', on);
    if(on){
      // Remove hero animation tiles after first frame
      if(heroMosaic) heroMosaic.innerHTML='';
    } else {
      if(heroMosaic && heroMosaic.children.length===0){
        const total = 20; // smaller than original to stay lighter
        for(let i=0;i<total;i++){
          const span=document.createElement('span');
          span.style.background='#ffffff10';
          heroMosaic.appendChild(span);
        }
      }
    }
  }
  applyPerfMode(perfMode);
  if(perfToggle){
    perfToggle.classList.toggle('active', perfMode);
    perfToggle.addEventListener('click', ()=>{
      perfMode=!perfMode; localStorage.setItem(PERF_KEY, perfMode?'1':'0');
      applyPerfMode(perfMode);
    });
  }

  // ========== RENDER ========== //
  function formatDate(dateStr){
    const d = new Date(dateStr + 'T00:00:00');
    if(isNaN(d)) return dateStr;
    return d.toLocaleDateString('vi-VN', {year:'numeric', month:'short', day:'numeric'});
  }

  function createTimelineItem(entry, idx){
    const node = timelineItemTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.index = idx;
    node.querySelector('time').textContent = formatDate(entry.date);
    const img = node.querySelector('img');
    img.src = entry.img;
    img.alt = entry.title;
    node.querySelector('.caption').textContent = entry.title;
    node.querySelector('.title').textContent = entry.title;
    node.querySelector('.desc').textContent = entry.desc || '';
    const tagList = node.querySelector('.tags');
    (entry.tags||[]).slice(0,5).forEach(t=>{ const li=document.createElement('li'); li.textContent=t; tagList.appendChild(li); });
    node.addEventListener('click', ()=> openLightbox(entry));
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
      div.className = 'subgroup';
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
        btn.innerHTML = `<img loading="lazy" data-src="${item.img}" alt="${item.title}">`;
        btn.dataset.seq = sg.key;
        btn.dataset.index = i;
        btn.dataset.img = item.img;
        thumbs.appendChild(btn);
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
        featureBox.innerHTML = `<figure><div class="feat-img"><img src="${target.dataset.img}" alt="Tiêu biểu ${sg.name}"></div><figcaption>${target.title}</figcaption></figure>`;
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

  function createGalleryItem(data){
    const node = galleryItemTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.style = data.style;
    const img = node.querySelector('img');
    img.src = data.img;
    img.alt = data.title;
    node.querySelector('.caption').textContent = data.title;
    return node;
  }

  function createYearSeparator(year){
    const li = document.createElement('li');
    li.className = 'timeline-year';
    li.innerHTML = `<div class="year-marker"><span>${year}</span></div>`;
    return li;
  }

  const GROUP_MODE = true; // bật grouping

  // ====== DEFERRED GALLERY ======
  let galleryLoaded = false;
  let pendingGalleryList = [];
  function renderGallery(list){
    galleryGrid.innerHTML='';
    list.forEach(entry=> galleryGrid.appendChild(createGalleryItem(entry)));
    galleryLoaded = true;
  }

  function scheduleGalleryLoad(){
    if(galleryLoaded) return;
    const gallerySection = document.getElementById('boSuuTap');
    // Load when section enters viewport
    const obs = new IntersectionObserver(entries => {
      entries.forEach(en=>{
        if(en.isIntersecting){
          renderGallery(pendingGalleryList);
          obs.disconnect();
        }
      });
    }, {rootMargin: '200px 0px'});
    obs.observe(gallerySection);
    // Fallback idle load after 3s
    setTimeout(()=> { if(!galleryLoaded) renderGallery(pendingGalleryList); }, 3000);
  }

  function render(list){
    timelineList.innerHTML='';
    if(!galleryLoaded){
      pendingGalleryList = list.slice();
    } else {
      renderGallery(list);
    }
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
      groups.forEach(g=>{
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
            if(anchor){ anchor.scrollIntoView({behavior:'smooth', block:'start'}); }
          });
          kyNav.appendChild(btn);
        }
      });
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
    scheduleGalleryLoad();
    setupLazyLoading();
  }

  // ====== SEQUENCE NAV ======
  let sequences = {}; let currentSeqKey=null; let currentSeqIndex=0;
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
  function ensureLightbox(){
    if(lightboxEl) return lightboxEl;
    lightboxEl = document.createElement('div');
    lightboxEl.className = 'lightbox hidden';
    lightboxEl.innerHTML = `<div class="lb-backdrop"></div><div class="lb-dialog" role="dialog" aria-modal="true"><button class="lb-close" aria-label="Đóng">×</button><button class="lb-zoom" aria-label="Phóng to">⤢</button><button class="lb-feature" aria-label="Đánh dấu tiêu biểu" title="Đánh dấu tiêu biểu">☆</button><button class="lb-nav-btn prev" aria-label="Ảnh trước">‹</button><button class="lb-nav-btn next" aria-label="Ảnh tiếp">›</button><figure class="lb-figure"><img alt=""/><figcaption class="lb-cap"></figcaption></figure><div class="lb-meta"><span class="lb-nav-info"></span></div><div class="lb-strip"><div class="lb-strip-inner"></div></div></div>`;
    document.body.appendChild(lightboxEl);
    lightboxEl.addEventListener('click', e=>{ if(e.target.classList.contains('lb-backdrop')|| e.target.classList.contains('lb-close')) closeLightbox(); });
    lightboxEl.querySelector('.lb-nav-btn.prev').addEventListener('click', e=>{ e.stopPropagation(); prevImage(); });
    lightboxEl.querySelector('.lb-nav-btn.next').addEventListener('click', e=>{ e.stopPropagation(); nextImage(); });
    lightboxEl.querySelector('.lb-zoom').addEventListener('click', e=>{ e.stopPropagation(); toggleZoom(); });
    lightboxEl.querySelector('.lb-feature').addEventListener('click', e=>{ e.stopPropagation(); toggleFeaturedFromLightbox(); });
    window.addEventListener('keydown', e=>{
      if(lightboxEl.classList.contains('hidden')) return;
      if(e.key==='ArrowRight') nextImage();
      else if(e.key==='ArrowLeft') prevImage();
      else if(e.key==='Escape') closeLightbox();
      else if(e.key===" ") { e.preventDefault(); toggleZoom(); }
      else if(e.key==='f' || e.key==='F'){ e.preventDefault(); toggleFeaturedFromLightbox(); }
    });
    return lightboxEl;
  }
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
    el.querySelector('img').src = item.img;
    el.querySelector('img').alt = item.title;
    el.querySelector('.lb-cap').textContent = item.title;
  // meta giữ lại nav info container
  updateLightboxNav();
  refreshLightboxFeatureState(item);
    el.classList.remove('hidden');
    document.body.style.overflow='hidden';
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
      b.innerHTML=`<img src="${it.img}" alt="${it.title}" loading="lazy">`;
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
    lightboxEl.classList.toggle('zoomed');
  }

  // Patch sequence open to also build strip
  const _openSequenceAt = openSequenceAt;
  openSequenceAt = function(key,index){
    _openSequenceAt(key,index);
    buildStrip(key);
    updateStripActive();
  };

  // ====== LAZY LOAD ======
  function setupLazyLoading(){
    const imgs = document.querySelectorAll('img[data-src]');
    if(!('IntersectionObserver' in window)){ imgs.forEach(i=>{ i.src=i.dataset.src; i.removeAttribute('data-src'); }); return; }
    const io = new IntersectionObserver(entries=>{
      entries.forEach(en=>{
        if(en.isIntersecting){ const img=en.target; img.src=img.dataset.src; img.removeAttribute('data-src'); io.unobserve(img);} });
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

  [searchInput, sortSelect].forEach(el => el.addEventListener('input', ()=> render(getFiltered())));

  // ========== INTERSECTION ANIMATION ========== //
  let observer;
  function observeItems(){
    if(observer) observer.disconnect();
    const items = Array.from(document.querySelectorAll('.timeline-item'));
    // Stagger delay
    items.forEach((el,i)=>{
      el.style.transitionDelay = (i*55)+'ms';
    });
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          entry.target.classList.add('visible');
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

  // Scroll progress
  function updateScrollProgress(){
    if(!progressBar) return;
    const h = document.documentElement;
    const scrolled = (h.scrollTop)/(h.scrollHeight - h.clientHeight);
    progressBar.style.width = (scrolled*100).toFixed(2)+'%';
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
})();
