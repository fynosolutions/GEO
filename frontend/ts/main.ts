import { ensureAuthenticated } from './auth.js';
const form = document.querySelector<HTMLFormElement>('#check-form')!;
const input = document.querySelector<HTMLInputElement>('#website')!;
const button = document.querySelector<HTMLButtonElement>('#submit-button')!;
const buttonLabel = document.querySelector<HTMLSpanElement>('#button-label')!;
const result = document.querySelector<HTMLDivElement>('#result')!;

function showResult(message: string, kind: 'info' | 'error'): void {
  result.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = message;
  result.append(title);
  result.dataset.kind = kind;
  result.hidden = false;
}

input.addEventListener('input', () => {
  input.removeAttribute('aria-invalid');
  result.hidden = true;
});

function updateSearchPreview(){
 const address=document.querySelector<HTMLInputElement>('#target-address')!.value.trim();
 document.querySelector('#search-preview')!.textContent=input.value.trim()?`Google Maps search: ${input.value.trim()}${address?' — '+address:''}`:'';
}
input.addEventListener('input',updateSearchPreview);
document.querySelector('#target-address')!.addEventListener('input',updateSearchPreview);
document.querySelector<HTMLInputElement>('#collect-menus')!.addEventListener('change',event=>{document.querySelector<HTMLElement>('#menu-options')!.hidden=!(event.target as HTMLInputElement).checked;});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  const value = input.value.trim();
  if(!value){showResult('Enter a restaurant name or Google place ID.','error');return;}
  const kind=document.querySelector<HTMLSelectElement>('#input-kind')!.value;
  const target=kind==='place_id'?{place_id:value}:{name:value};
  const platforms=Array.from(document.querySelectorAll<HTMLInputElement>('input[name="platforms"]:checked')).map(el=>el.value);
  if(!platforms.length){showResult('Select at least one platform.','error');return;}
  button.disabled = true;
  button.classList.add('is-loading');
  buttonLabel.textContent = 'Submitting...';
  form.setAttribute('aria-busy', 'true');
  result.hidden = true;
  try {
    await ensureAuthenticated();
    const response = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...target, platforms, ...(document.querySelector<HTMLInputElement>('#collect-menus')!.checked?{menu_mode:document.querySelector<HTMLSelectElement>('#menu-mode')!.value}:{}), target_address: document.querySelector<HTMLInputElement>('#target-address')?.value.trim() || null }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json() as { message?: string; result_url?: string };
    if (!response.ok) throw new Error(data.message ?? 'Submission failed. Please try again.');
    if (!data.result_url?.startsWith('/results?id=')) throw new Error('Invalid audit response.');
    window.location.assign(data.result_url);
  } catch (error) {
    const message = error instanceof Error && error.name === 'Error' ? error.message : 'Could not connect. Please check that the server is running and try again.';
    showResult(message, 'error');
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
    buttonLabel.textContent = 'Collect JSON';
    form.removeAttribute('aria-busy');
  }
});
