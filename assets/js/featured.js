// featured.js - hỗ trợ đồng bộ ảnh tiêu biểu công khai
// Cơ chế:
// 1. Nếu tìm thấy biến window.GLOBAL_FEATURED (build thủ công) => dùng làm mặc định.
// 2. Người sở hữu site có thể dùng nút export (Ⓛ) để sao chép JSON mapping hiện tại rồi dán vào file data.js hoặc 1 file cấu hình deploy.
// 3. Trình duyệt người xem khác sẽ thấy ảnh tiêu biểu vì mapping được tải sẵn trước main.js.

(function(){
  // Hook để main.js có thể đọc
  window.getInitialFeaturedMap = function(){
    // Ưu tiên GLOBAL_FEATURED nếu tồn tại
    if(window.GLOBAL_FEATURED && typeof window.GLOBAL_FEATURED === 'object'){
      try { return JSON.parse(JSON.stringify(window.GLOBAL_FEATURED)); } catch(e){ return {}; }
    }
    return {}; // không có => rỗng
  };

  // Nút export cho admin (đơn giản: copy clipboard). Có thể ẩn qua CSS nếu không cần.
  document.addEventListener('DOMContentLoaded', ()=>{
    const btn = document.getElementById('exportFeatured');
    if(!btn) return;
    btn.addEventListener('click', ()=>{
      if(!window.exportCurrentFeatured){
        alert('Chức năng chưa sẵn sàng (main.js chưa load).');
        return;
      }
      const json = window.exportCurrentFeatured();
      navigator.clipboard.writeText(json).then(()=>{
        btn.textContent='✔';
        setTimeout(()=> btn.textContent='⬇',1200);
      }).catch(()=>{
        prompt('Copy thủ công JSON dưới:', json);
      });
    });
  });
})();
