window.onerror=function(msg){
  var el=document.getElementById('app');
  if(el){
    el.innerHTML=
      '<div style="padding:32px;text-align:center;font-family:system-ui">'+
      '<h2 style="margin:0 0 8px">SmrutiCortex hit a hiccup</h2>'+
      '<p style="color:#64748b;margin:0 0 16px">Something went wrong loading the popup.</p>'+
      '<button id="error-reload" style="padding:8px 20px;border-radius:8px;border:1px solid #e2e8f0;background:#3b82f6;color:#fff;cursor:pointer;font-size:14px">Reload</button>'+
      '<p style="color:#94a3b8;font-size:11px;margin:12px 0 0">'+msg+'</p>'+
      '</div>';
    var btn=document.getElementById('error-reload');
    if(btn) btn.addEventListener('click',function(){location.reload();});
  }
};
window.onunhandledrejection=function(e){window.onerror(e.reason||'Async error');};
