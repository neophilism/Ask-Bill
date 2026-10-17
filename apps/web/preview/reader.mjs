/** AB-004 preview only: an accessible, source-accurate, provider-free reader. */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
}
export function assertIncompleteFixture(fixture) {
  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)
    || fixture.fixtureOnly !== true || fixture.sourceComplete !== false
    || fixture.publicationAllowed !== false || fixture.status !== 'draft'
    || typeof fixture.text !== 'string' || !fixture.text.trim()
    || fixture.text.length > 10000
    || typeof fixture.provisionLabel !== 'string' || fixture.provisionLabel.length > 200) {
    throw new Error('Local preview requires an explicitly incomplete, nonpublishable source fixture');
  }
  return fixture;
}
export function renderPreview(input) {
  const fixture = assertIncompleteFixture(input);
  const quote = escapeHtml(fixture.text);
  const label = escapeHtml(fixture.provisionLabel);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="description" content="Ask Bill independent source-grounded legislative reader, offline preview">
  <title>Ask Bill | Reader preview</title>
  <link rel="stylesheet" href="/preview.css">
  <script src="/preview.js" type="module" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to the legislation</a>
  <header class="masthead">
    <div class="brand" aria-label="Ask Bill"><span class="brand-mark" aria-hidden="true">§</span><span>Ask Bill</span></div>
    <div class="masthead-subtitle">Understand legislation, one section at a time.</div>
    <span class="mode-label">Offline demonstration</span>
  </header>
  <main id="main" class="workspace">
    <nav class="toolbar" aria-label="Reader controls">
      <a href="/characters">Audition 20 Bills in 3D</a>
      <label for="bill-picker">Document</label>
      <select id="bill-picker" aria-describedby="source-limit"><option>Electronic filing draft — excerpt</option></select>
      <div class="toolbar-spacer"></div>
      <span id="text-controls-label" class="toolbar-label">Text size</span>
      <div class="segmented" role="group" aria-labelledby="text-controls-label">
        <button type="button" data-text-size="small" aria-pressed="false">A−</button>
        <button type="button" data-text-size="normal" aria-pressed="true">A</button>
        <button type="button" data-text-size="large" aria-pressed="false">A+</button>
      </div>
    </nav>
    <div class="notice" id="source-limit" role="note"><strong>Incomplete draft excerpt.</strong> This is not a full bill, enacted law, official filing guidance, or legal advice. No AI or live voice service is enabled in this preview.</div>
    <div class="columns">
      <article class="document-panel" aria-labelledby="document-heading">
        <div class="eyebrow">Source document <span aria-hidden="true">/</span> Draft</div>
        <h1 id="document-heading">Electronic Filing Draft</h1>
        <p class="document-subtitle">Limited excerpt for testing the reading experience.</p>
        <nav aria-label="On this page"><a href="#provision">Jump to the available passage</a></nav>
        <hr>
        <section id="provision" tabindex="-1" aria-labelledby="provision-heading">
          <p class="section-index">AVAILABLE PASSAGE</p>
          <h2 id="provision-heading">${label}</h2>
          <blockquote class="legal-text" id="canonical-quote" lang="en">${quote}</blockquote>
          <p class="unavailable">The supplied text stops here. Later clauses and definitions have not been provided.</p>
        </section>
        <details id="source-drawer" class="source-drawer" open>
          <summary>View source and citation details</summary>
          <dl>
            <div><dt>Document status</dt><dd>Unverified draft excerpt</dd></div>
            <div><dt>Provision</dt><dd>${label}</dd></div>
            <div><dt>Completeness</dt><dd>Incomplete</dd></div>
            <div><dt>Authority</dt><dd>Not certified as current law</dd></div>
          </dl>
          <p>The exact excerpt appears above. A complete version and authoritative source URL are required before publication.</p>
        </details>
      </article>
      <aside class="conversation-panel" aria-labelledby="conversation-heading">
        <div class="conversation-header">
          <div><p class="eyebrow">Your guide</p><h2 id="conversation-heading">Ask Bill</h2></div>
          <button type="button" id="toggle-character" aria-pressed="false" aria-controls="bill-illustration">Hide illustration</button>
        </div>
        <div class="character-slot" id="bill-illustration" role="img" aria-label="Temporary illustration: folded document with a friendly face, not the final animated Bill model">
          <div class="folio" aria-hidden="true"><span class="folio-eye left"></span><span class="folio-eye right"></span><span class="folio-mouth"></span><span class="folio-corner"></span></div>
          <span class="illustration-caption">Illustration placeholder · 3D character not yet built</span>
        </div>
        <div class="chat-intro"><p><strong>Hi! I'm Bill.</strong> I can show you what this short draft excerpt says, and where the source stops.</p><p>Choose a sample question to see a sourced answer.</p></div>
        <div class="question-choices" role="group" aria-label="Demo questions">
          <button type="button" data-demo="receipt">What does the draft say about receipt time?</button>
          <button type="button" data-demo="employee">Does receipt wait for someone to read it?</button>
          <button type="button" data-demo="unknown">Who would be affected?</button>
        </div>
        <section class="answer-panel" aria-labelledby="answer-heading">
          <h3 id="answer-heading">Answer</h3>
          <p id="demo-answer" tabindex="-1" role="status" aria-live="polite" aria-atomic="true">Choose a question above to begin.</p>
          <a href="#provision" id="answer-citation" hidden>See the cited draft excerpt</a>
        </section>
        <div class="disabled-chat"><label for="question-field">Ask your own question</label><textarea id="question-field" rows="2" disabled placeholder="Live conversation is not available in this offline preview"></textarea><p>This preview does not send questions, recordings, or personal data to any AI provider.</p></div>
      </aside>
    </div>
  </main>
  <footer class="footer">Ask Bill · Independent legislative explainer · Preview only, not a government service.</footer>
</body></html>`;
}
