const answers = Object.freeze({
  receipt: 'The supplied draft excerpt says the legally effective receipt time is when a submission first enters an authorized federal intake system. The excerpt is incomplete and has not been verified as current law.',
  employee: 'The excerpt begins to contrast the intake-system entry time with something else, but the sentence ends before that explanation. This fragment cannot establish whether an employee reading it matters in all cases.',
  unknown: 'I cannot determine who is covered or whether there are exceptions from this fragment. The full draft, definitions, and authoritative text are not available here.'
});
const answer = document.querySelector('#demo-answer');
const citation = document.querySelector('#answer-citation');
for (const button of document.querySelectorAll('[data-demo]')) {
  button.addEventListener('click', () => {
    const text = answers[button.dataset.demo];
    if (!text || !answer || !citation) return;
    answer.textContent = text;
    citation.hidden = button.dataset.demo === 'unknown';
    for (const choice of document.querySelectorAll('[data-demo]')) {
      choice.setAttribute('aria-pressed', String(choice === button));
    }
    answer.focus({ preventScroll: true });
  });
}
const sizeButtons = document.querySelectorAll('[data-text-size]');
const fontSize = { small: '1rem', normal: '1.125rem', large: '1.4rem' };
for (const button of sizeButtons) {
  button.addEventListener('click', () => {
    if (!Object.hasOwn(fontSize, button.dataset.textSize)) return;
    document.documentElement.style.setProperty('--reader-font-size', fontSize[button.dataset.textSize]);
    for (const choice of sizeButtons) choice.setAttribute('aria-pressed', String(choice === button));
  });
}
const toggle = document.querySelector('#toggle-character');
const illustration = document.querySelector('#bill-illustration');
toggle?.addEventListener('click', () => {
  if (!illustration) return;
  illustration.hidden = !illustration.hidden;
  toggle.setAttribute('aria-pressed', String(illustration.hidden));
  toggle.textContent = illustration.hidden ? 'Show illustration' : 'Hide illustration';
});
