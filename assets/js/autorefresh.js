// autorefresh.js - dev helper: tự động phát hiện thay đổi data.js & ảnh mới mà không cần F5 thủ công
// Cơ chế: định kỳ fetch assets/js/data.js kèm query bust, so sánh số lượng & danh sách đường dẫn.
// Nếu khác -> reload trang (hoặc chỉ cập nhật window.artworks & gọi render lại nếu muốn nâng cao).

(function(){
  const ENABLE_KEY = 'autoRefreshData';
  // Bật theo mặc định trong môi trường dev (dựa theo location.protocol) nhưng có thể tắt bằng localStorage.
  const isLocal = location.hostname === 'localhost' || /^(127|192\.168)/.test(location.hostname) || location.protocol === 'file:';
  if(!isLocal && localStorage.getItem(ENABLE_KEY)==='off') return;

  let lastSignature = signature(window.artworks||[]);
  let lastCount = (window.artworks||[]).length;
  let timer = null;

  function signature(list){
    // Tạo chuỗi hash đơn giản từ danh sách đường dẫn ảnh
    return list.map(a=>a.img).sort().join('|');
  }

  async function check(){
    try {
      const bust = Date.now().toString().slice(-7);
      const res = await fetch('assets/js/data.js?v='+bust, {cache:'no-store'});
      if(!res.ok) return schedule();
      const txt = await res.text();
      // Tìm mảng artworks bằng regex sơ bộ
      const match = /const artworks = \[(.*)\];/s.exec(txt);
      if(!match){ return schedule(); }
      // Eval an toàn trong scope riêng
      let newList = [];
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function(match[0]+'; return artworks;');
        newList = fn();
      } catch(e){ return schedule(); }
      const sig = signature(newList);
      if(sig !== lastSignature || newList.length !== lastCount){
        console.log('[autorefresh] Phát hiện thay đổi data.js -> cập nhật động');
        // Giữ lại object cũ theo img để hạn chế thay đổi không cần thiết
        const oldByImg = new Map((window.artworks||[]).map(a=> [a.img, a]));
        const merged = newList.map(n => oldByImg.get(n.img) ? Object.assign(oldByImg.get(n.img), n) : n);
        window.artworks = merged;
        lastSignature = sig; lastCount = merged.length;
        if(typeof window.__refreshArtworks === 'function') window.__refreshArtworks();
        return; // không reload trang
      }
    } catch(e){} finally { schedule(); }
  }
  function schedule(){ timer = setTimeout(check, 5000); }
  schedule();
})();
