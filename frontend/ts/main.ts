import { ensureAuthenticated } from './auth.js';
const form = document.querySelector<HTMLFormElement>('#check-form')!;
const input = document.querySelector<HTMLInputElement>('#website')!;
const button = document.querySelector<HTMLButtonElement>('#submit-button')!;
const buttonLabel = document.querySelector<HTMLSpanElement>('#button-label')!;
const introductionButton = document.querySelector<HTMLButtonElement>('#introduction-button')!;
const introductionPlatforms = new Set(['google_maps', 'yelp', 'tripadvisor']);
const result = document.querySelector<HTMLDivElement>('#result')!;
const inputKind=document.querySelector<HTMLSelectElement>('#input-kind')!;
const storesInput=document.querySelector<HTMLTextAreaElement>('#stores-input')!;
const menuCheckbox=document.querySelector<HTMLInputElement>('#collect-menus')!;
inputKind.addEventListener('change',()=>{
 const batch=inputKind.value==='batch';
 document.querySelector<HTMLElement>('#single-target')!.hidden=batch;input.required=!batch;
 document.querySelector<HTMLElement>('#batch-target')!.hidden=!batch;storesInput.required=batch;
 menuCheckbox.disabled=batch;
 document.querySelector<HTMLElement>('#menu-options')!.hidden=batch||!menuCheckbox.checked;
 document.querySelector('#form-note')!.textContent=batch?'Batch files are saved under out/information/batches/ or out/introductions/batches/.':'Files are saved under out/information/ or out/introductions/.';
});
document.querySelector<HTMLInputElement>('#stores-file')!.addEventListener('change',async event=>{
 const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;
 if(file.size>60000){showResult('Restaurant list file must be at most 60 KB.','error');return;}
 try{storesInput.value=await file.text();}catch{showResult('Could not read the restaurant list file.','error');}
});

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
  const introduction = event.submitter === introductionButton;
  const activeButton = introduction ? introductionButton : button;
  const activeLabel = introduction ? introductionButton : buttonLabel;
  const label = activeLabel.textContent;
  const value = input.value.trim();
  const kind=inputKind.value,batch=kind==='batch';
  if(!batch&&!value){showResult('Enter a restaurant name or Google place ID.','error');return;}
  if(batch&&!storesInput.value.trim()){showResult('Enter or upload a restaurant list.','error');return;}
  const target=batch?{stores:storesInput.value}:kind==='place_id'?{place_id:value}:{name:value};
  const platforms=Array.from(document.querySelectorAll<HTMLInputElement>('input[name="platforms"]:checked')).map(el=>el.value).filter(platform=>!introduction||introductionPlatforms.has(platform));
  if(!platforms.length){showResult(introduction?'Select Google Maps, Yelp or Tripadvisor.':'Select at least one platform.','error');return;}
  button.disabled = introductionButton.disabled = true;
  activeButton.classList.add('is-loading');
  activeLabel.textContent = 'Submitting...';
  form.setAttribute('aria-busy', 'true');
  result.hidden = true;
  try {
    await ensureAuthenticated();
    const response = await fetch(introduction ? '/api/introduction' : '/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...target, platforms, ...(!introduction&&!batch&&menuCheckbox.checked?{menu_mode:document.querySelector<HTMLSelectElement>('#menu-mode')!.value,menu_scope:document.querySelector<HTMLSelectElement>('#menu-scope')!.value}:{}), ...(!batch?{target_address:document.querySelector<HTMLInputElement>('#target-address')?.value.trim()||null}:{}) }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json() as { message?: string; result_url?: string };
    if (!response.ok) throw new Error(data.message ?? 'Submission failed. Please try again.');
    if (!data.result_url?.startsWith(introduction ? '/introduction?id=' : '/results?id=')) throw new Error('Invalid audit response.');
    window.location.assign(data.result_url);
  } catch (error) {
    const message = error instanceof Error && error.name === 'Error' ? error.message : 'Could not connect. Please check that the server is running and try again.';
    showResult(message, 'error');
  } finally {
    button.disabled = introductionButton.disabled = false;
    activeButton.classList.remove('is-loading');
    activeLabel.textContent = label;
    form.removeAttribute('aria-busy');
  }
});
