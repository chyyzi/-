'use strict';
window.ChirpStore={
  readJSON(key,fallback){try{const value=localStorage.getItem(key);return value===null?fallback:JSON.parse(value);}catch{return fallback;}},
  writeJSON(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}},
  remove(key){try{localStorage.removeItem(key);}catch{}},
  async open(){
    if(this.promise)return this.promise;
    this.promise=new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(new Error('IndexedDB 不可用'));return;}
      const r=indexedDB.open('chirp-field-notes',1);
      r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'id'});
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });return this.promise;
  },
  async all(){const db=await this.open();return new Promise((resolve,reject)=>{const r=db.transaction('photos','readonly').objectStore('photos').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});},
  async put(photo){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put(photo);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});},
  async delete(id){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
};
