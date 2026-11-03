import { ensureAuthenticated } from './auth.js';
const form = document.querySelector<HTMLFormElement>('#check-form')!;
const input = document.querySelector<HTMLInputElement>('#website')!;
const button = document.querySelector<HTMLButtonElement>('#submit-button')!;
const buttonLabel = document.querySelector<HTMLSpanElement>('#button-label')!;
const result = document.querySelector<HTMLDivElement>('#result')!;

function showResult(message: string, kind: 'info' | 'error', url?: string): void {
  result.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = message;
  result.append(title);
  if (url) {
    const detail = document.createElement('p');
    detail.textContent = `Submitted URL: ${url}`;
    result.append(detail);
  }
  result.dataset.kind = kind;
  result.hidden = false;
}

input.addEventListener('input', () => {
  input.removeAttribute('aria-invalid');
  result.hidden = true;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  const value = input.value.trim();
  let url: URL;
  try {
    if (!value || /\s/.test(value)) throw new Error();
    url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
  } catch {
    input.setAttribute('aria-invalid', 'true');
    showResult('Please enter a valid website URL, e.g. example.com.', 'error');
    input.focus();
    return;
  }
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
      body: JSON.stringify({ url: url.href, target_address: document.querySelector<HTMLInputElement>('#target-address')?.value.trim() || null }),
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
    buttonLabel.textContent = 'Check website';
    form.removeAttribute('aria-busy');
  }
});
