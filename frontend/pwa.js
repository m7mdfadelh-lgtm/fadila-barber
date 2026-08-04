let deferredInstallPrompt;
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
const isIos=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;document.getElementById('installButton')?.classList.remove('hidden')});
window.addEventListener('appinstalled',()=>{document.getElementById('installGate')?.classList.add('hidden');deferredInstallPrompt=null});
document.addEventListener('DOMContentLoaded',async()=>{
  if('serviceWorker'in navigator) await navigator.serviceWorker.register('./sw.js');
  const gate=document.getElementById('installGate');
  if(gate&&!isStandalone()) gate.classList.remove('hidden');
  document.getElementById('iosInstructions')?.classList.remove('hidden');
  document.getElementById('androidInstructions')?.classList.remove('hidden');
  document.getElementById('installButton')?.addEventListener('click',async()=>{if(!deferredInstallPrompt)return;await deferredInstallPrompt.prompt();deferredInstallPrompt=null});
});
window.FadilaPwa={isStandalone};
