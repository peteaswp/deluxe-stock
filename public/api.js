/* ===== ตัวเชื่อมหน้าเว็บกับเซิร์ฟเวอร์ของบริษัท =====
   ให้หน้าตาเหมือนฐานข้อมูลเดิมทุกอย่าง (doc / collection / onSnapshot)
   หน้าเว็บจึงใช้โค้ดเดิมได้โดยไม่ต้องแก้ตรรกะ                         */
(function(){
  var VER={}, LIS=[], es=null;
  function j(r){ return r.json().catch(function(){return {}}) }
  function req(m,u,b){
    return fetch(u,{method:m,credentials:'same-origin',
      headers:b?{'Content-Type':'application/json'}:undefined,
      body:b?JSON.stringify(b):undefined}).then(function(r){
        return j(r).then(function(d){ d.__status=r.status; return d });
      });
  }
  function snapDoc(path,d){
    return {id:path.split('/').pop(),exists:!!(d&&d.exists),
      data:function(){return d&&d.data?d.data:undefined},
      metadata:{fromCache:false,hasPendingWrites:false}};
  }
  function fetchDoc(path){
    return req('GET','/api/doc/'+path).then(function(d){
      if(d.exists)VER[path]=d.version;
      return d;
    });
  }
  function connectStream(){
    if(es)return;
    try{ es=new EventSource('/api/stream') }catch(e){ return }
    es.onmessage=function(ev){
      var p; try{ p=JSON.parse(ev.data).path }catch(e){ return }
      if(p==='*'){ LIS.forEach(function(l){l.run()}); return }   /* กู้คืนข้อมูล: โหลดใหม่ทั้งหมด */
      LIS.forEach(function(l){
        if(l.kind==='doc'&&l.path===p)l.run();
        if(l.kind==='col'&&p.indexOf(l.path+'/')===0)l.run();
      });
    };
    es.onerror=function(){ /* EventSource ต่อกลับเองอัตโนมัติ */ };
  }
  function mkDoc(path){
    return {
      path:path,
      get:function(){ return fetchDoc(path).then(function(d){return snapDoc(path,d)}) },
      set:function(body){
        return req('PUT','/api/doc/'+path,{data:body,ifVersion:VER[path]}).then(function(d){
          if(d.__status===200){ VER[path]=d.version; return }
          var e=new Error(d.error||'write_failed');
          e.code=d.__status===409?'version_mismatch':(d.__status===403?'invalid_argument':'unavailable');
          if(d.__status===409)delete VER[path];
          throw e;
        });
      },
      update:function(body){ return this.set(body) },
      delete:function(){ return req('DELETE','/api/doc/'+path).then(function(d){
          if(d.__status!==200){var e=new Error('delete_failed');e.code='invalid_argument';throw e}
          delete VER[path];
        }) },
      acquire:function(o){ return req('POST','/api/lease/'+path,{holder:(o&&o.holder)||'x',ttlMs:(o&&o.ttlMs)||30000}) },
      onSnapshot:function(next,err){
        var l={kind:'doc',path:path,run:function(){
          fetchDoc(path).then(function(d){ next(snapDoc(path,d)) },function(){ if(err)err({code:'unavailable'}) });
        }};
        LIS.push(l); connectStream(); l.run();
        return function(){ LIS=LIS.filter(function(x){return x!==l}) };
      },
      collection:function(){ return null }
    };
  }
  function mkCol(col){
    var o={path:col};
    o.orderBy=function(){return o}; o.limit=function(){return o}; o.where=function(){return o};
    o.get=function(){
      return req('GET','/api/col/'+col).then(function(d){
        var docs=(d.docs||[]).map(function(x){ VER[col+'/'+x.id]=x.data&&x.data.__v;
          return {id:x.id,exists:true,data:function(){return x.data},metadata:{}} });
        return {docs:docs,size:docs.length,empty:!docs.length,docChanges:function(){return[]},metadata:{}};
      });
    };
    o.onSnapshot=function(next,err){
      var l={kind:'col',path:col,run:function(){
        o.get().then(next,function(){ if(err)err({code:'unavailable'}) });
      }};
      LIS.push(l); connectStream(); l.run();
      return function(){ LIS=LIS.filter(function(x){return x!==l}) };
    };
    o.doc=function(id){ return mkDoc(col+'/'+id) };
    o.add=function(d){ var id='x'+Date.now().toString(36); return mkDoc(col+'/'+id).set(d).then(function(){return mkDoc(col+'/'+id)}) };
    return o;
  }
  window.FS={
    db:{doc:mkDoc,collection:mkCol},
    me:function(){ return req('GET','/api/me') },
    login:function(u,p,r){ return req('POST','/api/login',{username:u,password:p,remember:r}) },
    logout:function(){ return req('POST','/api/logout',{}) },
    users:function(){ return req('GET','/api/users') },
    addUser:function(b){ return req('POST','/api/users',b) },
    saveUser:function(b){ return req('PUT','/api/users',b) },
    restore:function(data,keepUsers){ return req('POST','/api/restore',{data:data,keepUsers:!!keepUsers}) },
    setPassword:function(o,n){ return req('POST','/api/password',{old:o,new:n}) },
    download:function(name,data,mime){
      var b=new Blob([data],{type:mime||'text/plain;charset=utf-8'});
      var a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=name;
      document.body.appendChild(a); a.click();
      setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},2000);
      return Promise.resolve({status:'saved'});
    }
  };
})();
