(function(){
  var q=document.getElementById('q'), res=document.getElementById('res'), idx=null;
  fetch(window.BASE+'index.json').then(r=>r.json()).then(d=>idx=d);
  function norm(s){return (s||'').toLowerCase().replace(/\s+/g,'');}
  function count(h,n){var c=0,i=0;while((i=h.indexOf(n,i))>-1){c++;i+=n.length;}return c;}
  if(q) q.addEventListener('input',function(){
    var v=norm(q.value);
    if(!idx||v.length<1){res.style.display='none';return;}
    var hits=idx.map(function(d){
      var s=0;
      var t=norm(d.t);
      if(t.indexOf(v)>-1) s+=100 + (t.indexOf(v)===0?20:0);
      s+=count(norm(d.s),v)*15;
      s+=count(norm(d.b),v)*3;
      return {d:d,s:s};
    }).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,7);
    if(!hits.length){res.innerHTML='<a><span>검색 결과가 없습니다</span></a>';res.style.display='block';return;}
    res.innerHTML=hits.map(function(h){
      return '<a href="'+window.BASE+h.d.u+'"><span class="cat">'+h.d.c+'</span><b>'+h.d.t+'</b><span>'+h.d.s+'</span></a>';
    }).join('');
    res.style.display='block';
  });
  document.addEventListener('click',function(e){ if(!e.target.closest('.search')&&res) res.style.display='none'; });
  // 이미지 라이트박스
  var lb=document.getElementById('lb');
  if(lb){
    document.querySelectorAll('.doc img').forEach(function(im){
      im.addEventListener('click',function(){ lb.querySelector('img').src=im.src; lb.classList.add('on'); });
    });
    lb.addEventListener('click',function(){ lb.classList.remove('on'); });
    document.addEventListener('keydown',function(e){ if(e.key==='Escape') lb.classList.remove('on'); });
  }

  // 우측 목차 — 스크롤 위치 연동
  var links=[].slice.call(document.querySelectorAll('.toc a, .toc-m a'));
  if(links.length){
    var secs=links.map(function(a){return document.querySelector(a.getAttribute('href'));}).filter(Boolean);
    var n=links.length/ (document.querySelector('.toc-m') && document.querySelector('.toc') ? 2 : 1);
    var tick=function(){
      var y=window.scrollY+120, cur=0;
      secs.forEach(function(s,i){ if(s && s.offsetTop<=y) cur=i%n; });
      links.forEach(function(a,i){ a.classList.toggle('on', i%n===cur); });
    };
    window.addEventListener('scroll', tick, {passive:true});
    window.addEventListener('resize', tick); tick();
    links.forEach(function(a){ a.addEventListener('click', function(){
      setTimeout(function(){ links.forEach(function(x){x.classList.remove('on');}); a.classList.add('on'); }, 60);
    });});
  }

  // 모바일 — 서랍 / 검색 토글
  var nt=document.querySelector('.nav-toggle'), st=document.querySelector('.search-toggle'),
      bd=document.querySelector('.backdrop'), b=document.body;
  if(nt) nt.addEventListener('click',function(){ b.classList.toggle('nav-open'); });
  if(bd) bd.addEventListener('click',function(){ b.classList.remove('nav-open'); });
  if(st) st.addEventListener('click',function(){
    b.classList.toggle('search-open');
    if(b.classList.contains('search-open')){ var i=document.getElementById('q'); if(i) i.focus(); }
  });
  document.querySelectorAll('.lnb a').forEach(function(a){
    a.addEventListener('click',function(){ b.classList.remove('nav-open'); });
  });
  document.querySelectorAll('.toc-m a').forEach(function(a){
    a.addEventListener('click',function(){ var d=a.closest('details'); if(d) d.open=false; });
  });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') b.classList.remove('nav-open','search-open'); });
})();