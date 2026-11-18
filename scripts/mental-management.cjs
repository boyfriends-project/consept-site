const assert = require('node:assert/strict');
module.exports = function renderLesson(copy) {
  // No provider is enabled yet. Add an allowlisted renderer and page-scoped CSP when approved.
  assert(copy.video.provider === null && copy.video.url === null, 'Video embedding is not configured');
  const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<article class="lesson-page narrow section">
    <header class="lesson-heading"><p class="eyebrow">Free lesson</p><h1>${esc(copy.title)}</h1><p class="lesson-intro">${esc(copy.introduction)}</p></header>
    <section aria-label="レッスン動画" class="lesson-video"><div class="lesson-placeholder"><span class="lesson-placeholder-label">FREE VIDEO LESSON</span><p>動画を準備しています</p><span>こちらにレッスン動画を掲載予定です。</span></div></section>
    <section class="lesson-topics" aria-labelledby="lesson-topics-title"><p class="eyebrow">What you will learn</p><h2 id="lesson-topics-title">このレッスンで学べること</h2><ul>${copy.topics.map(t => '<li>'+esc(t)+'</li>').join('')}</ul></section>
    <section class="lesson-coaching" aria-labelledby="lesson-coaching-title"><h2 id="lesson-coaching-title">もっと実践的に身につけたい方へ</h2><p>個別コーチングでは、一人ひとりの状況に合わせてメンタルマネジメントを実践的に学べます。</p><a class="button" href="/coaching/">個別コーチングの詳細を見る<span aria-hidden="true">→</span></a></section>
  </article>`;
};
