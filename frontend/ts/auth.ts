let pending: Promise<void> | undefined;
export function ensureAuthenticated(): Promise<void> {
  return pending ||= (async () => {
    const status = await fetch('/api/session', {cache:'no-store'});
    if(status.ok) return;
    if(status.status !== 401) throw new Error('Server access is not configured. Set GEO_API_TOKEN and restart.');
    await new Promise<void>(resolve => {
      const form=document.createElement('form'), label=document.createElement('label'), input=document.createElement('input'), button=document.createElement('button'), message=document.createElement('p');
      label.textContent='Access token'; input.type='password'; input.required=true; input.autocomplete='off'; label.append(input);
      button.type='submit'; button.textContent='Unlock GEO'; message.setAttribute('role','status'); form.append(label,button,message); document.querySelector('main')!.prepend(form); input.focus();
      form.addEventListener('submit',async event=>{
        event.preventDefault(); button.disabled=true;
        try {const response=await fetch('/api/session',{method:'POST',headers:{Authorization:'Bearer '+input.value.trim()}});
          if(!response.ok) throw new Error('Access denied. Check the token or server configuration.');
          input.value=''; form.remove(); resolve();
        } catch {message.textContent='Access denied. Check the token or server connection.';} finally{button.disabled=false;}
      });
    });
  })().catch(error=>{pending=undefined;throw error;});
}
