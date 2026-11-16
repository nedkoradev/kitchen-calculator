// Preserve existing preference keys; never clear storage. Memory fallback is explicit.
export function createSafeStorage(getStorage){
 const memory=new Map();let persistent=true,lastError=null;
 return {get persistent(){return persistent},get lastError(){return lastError},getItem(key){try{const value=getStorage().getItem(key);if(value!==null)memory.set(key,value);else if(persistent)memory.delete(key);return value??memory.get(key)??null}catch{persistent=false;return memory.get(key)??null}},setItem(key,value,{strict=false}={}){const prior=memory.get(key);memory.set(key,String(value));try{getStorage().setItem(key,String(value));persistent=true;lastError=null;return true}catch(error){persistent=false;lastError=error;if(strict){if(prior===undefined)memory.delete(key);else memory.set(key,prior)}return false}},removeItem(key){memory.delete(key);try{getStorage().removeItem(key);return true}catch{persistent=false;return false}}};
}
export const appStorage=createSafeStorage(()=>globalThis.localStorage);
