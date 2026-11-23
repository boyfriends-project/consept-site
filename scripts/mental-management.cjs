const assert = require('node:assert/strict');
module.exports = function renderLesson(copy) {
  const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const video = item => {
    const url = new URL(item.url);
    const id = url.pathname.slice(1);
    assert(item.provider === 'youtube' && url.origin === 'https://youtu.be' && /^[A-Za-z0-9_-]{11}$/.test(id) && !url.search && !url.hash, 'Invalid video URL');
    return `<section class="lesson-recording"><h2>${esc(item.title)}</h2><div class="lesson-video" style="width:100%"><iframe src="https://www.youtube-nocookie.com/embed/${id}?playsinline=1&amp;rel=0" title="${esc(item.title)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe></div><p class="fine-print"><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">YouTubeで開く（別タブ）</a></p></section>`;
  };
  return `<article class="lesson-page narrow section">
    <header class="lesson-heading"><p class="eyebrow">Free lesson</p><h1>${esc(copy.title)}</h1><p class="lesson-intro">${esc(copy.introduction)}</p></header>
    ${video(copy.video)}
    ${video(copy.meditation)}
    <section class="lesson-coaching lesson-checklist" aria-labelledby="checklist-title" style="margin-top:48px"><p class="eyebrow">PDF worksheet</p><h2 id="checklist-title">不安になったときのチェックリスト</h2><p>不安を感じたときに、身体の状態や生活環境、触れた情報、思考の状態を振り返るためのチェックリストです。</p><p>今の自分の状態を整理したいときに、ぜひご活用ください。</p><a class="button" style="min-width:0;padding:16px 20px;overflow-wrap:anywhere" href="/downloads/consept_anxiety_checklist.pdf" download="consept_anxiety_checklist.pdf">チェックリストをダウンロード（PDF）</a></section>
    <section class="lesson-topics" aria-labelledby="lesson-topics-title"><p class="eyebrow">What you will learn</p><h2 id="lesson-topics-title">このレッスンで学べること</h2><ul>${copy.topics.map(t => '<li>'+esc(t)+'</li>').join('')}</ul></section>
    <section class="lesson-coaching" aria-labelledby="lesson-coaching-title"><h2 id="lesson-coaching-title">もっと実践的に身につけたい方へ</h2><p>個別コーチングでは、一人ひとりの状況に合わせてメンタルマネジメントを実践的に学べます。</p><div class="button-row"><a class="button" href="/coaching/">個別コーチングの詳細を見る<span aria-hidden="true">→</span></a><a class="button" href="https://forms.gle/WQZrT6XwHXSGYqwr8" target="_blank" rel="noopener noreferrer">無料個別相談はこちら<span aria-hidden="true">↗</span></a></div><p class="fine-print">オンライン・30分。無料個別相談フォームが別タブで開きます。</p></section>
  </article>`;
};
