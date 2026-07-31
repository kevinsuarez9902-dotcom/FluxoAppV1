const FinanceStorage={get(k,d=null){try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v);}catch(e){console.error(e);return d;}},set(k,v){localStorage.setItem(k,JSON.stringify(v));},remove(k){localStorage.removeItem(k);},exists(k){return localStorage.getItem(k)!==null;},clear(){localStorage.clear();}};

FinanceStorage.getRaw=(k)=>localStorage.getItem(k);
FinanceStorage.setRaw=(k,v)=>localStorage.setItem(k,v);
