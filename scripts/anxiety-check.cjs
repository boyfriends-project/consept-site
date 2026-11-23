const assert = require('node:assert/strict');

module.exports = function renderCheck(copy, { previewRegistration = false } = {}) {
  const escape = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const paragraphs = items => items.map(text => '<p>' + escape(text) + '</p>').join('\n');
  assert.equal(copy.questions.length, 12);
  assert.equal(copy.choices.length, 4);
  assert.deepEqual(copy.questions.map(q => q.id), Array.from({length: 12}, (_, i) => i + 1));
  assert.deepEqual(copy.questions.filter(q => q.reverse).map(q => q.id), [6, 9, 11, 12]);
  assert.deepEqual(copy.types.map(type => type.max), [9, 18, 27, 36]);
  const questions = copy.questions.map(q => `
    <fieldset id="question-${q.id}" data-question="${q.id}" data-reverse="${q.reverse}">
      <legend><span class="check-number">Q${q.id}.</span> ${escape(q.text)}</legend>
      <div class="check-options">${copy.choices.map((choice, score) => `
        <label><input type="radio" name="q${q.id}" value="${score}" required>
        <span>${escape(choice)}</span></label>`).join('')}</div>
    </fieldset>`).join('');
  const templates = copy.types.map(type => `
    <template data-max="${type.max}"><h3>${escape(type.name)}</h3>
    <p class="check-catch"><strong>${escape(type.catch)}</strong></p>
    ${paragraphs(type.paragraphs)}</template>`).join('');
  const video = copy.video;
  const showRegistration = video.visible || previewRegistration;
  if (showRegistration) {
    const url = new URL(video.formUrl);
    assert(url.protocol === 'https:' && url.hostname.endsWith('.sibforms.com') && url.pathname.startsWith('/serve/') && !url.search && !url.hash && !url.username && !url.password, 'Invalid Brevo form URL');
  }
  const invitation = showRegistration ? `<section class="check-video" aria-labelledby="video-title">
    ${previewRegistration ? '<p class="check-status">ローカル検証用：登録すると実際にBrevoからメールが送信されます。</p>' : ''}
    <h3>${escape(video.heading)}</h3><p>${escape(video.intro)}</p>
    <p>${escape(video.principle)}<strong>${escape(video.emphasis)}</strong></p>
    <p>${escape(video.offer)}</p><p class="check-video-label">${escape(video.label)}</p>
    <h4 id="video-title">${escape(video.title)}</h4><p>${escape(video.description)}</p>
    <p>${escape(video.delivery)}</p>
    <a class="button" href="${escape(video.formUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escape(video.button)}<span class="sr-only">（別タブで開きます）</span></a><p class="fine-print">Brevoの登録フォームが別タブで開きます。<a href="/privacy/">個人情報の取り扱い</a></p>
    <p class="fine-print">${escape(video.note)}</p></section>` : '';
  return `<div class="anxiety-check">
    <section class="check-intro narrow">
      <h1>${escape(copy.title)}</h1><p class="check-lead"><strong>${escape(copy.lead)}</strong></p>
      <div class="check-examples">${paragraphs(copy.examples)}</div>
      ${paragraphs(copy.intro)}<p><strong>${escape(copy.invitation)}</strong></p>
      <p>${escape(copy.duration)}</p><p class="fine-print">${escape(copy.notice)}</p>
    </section>
    <section class="narrow check-body" aria-labelledby="questions-title">
      <h2 id="questions-title">12の質問</h2>
      <p>それぞれ、今の自分に最も近いものを1つ選んでください。</p>
      <p>回答と結果は保存・送信されません。ページを再読み込みするとリセットされます。</p>
      <noscript><p>診断にはJavaScriptが必要です。ブラウザの設定で有効にしてから再読み込みしてください。</p></noscript>
      <form id="anxiety-form" autocomplete="off" novalidate>
        <fieldset id="check-controls" disabled>
          <legend class="sr-only">不安タイプ診断の回答</legend>
          <p id="check-progress" role="status">0 / 12問 回答済み</p>
          <p id="check-error" role="alert"></p>
          ${questions}
          <button class="button check-submit" type="button" id="check-submit">診断結果を見る</button>
        </fieldset>
      </form>
      <p id="check-update" role="status"></p>
      <section id="check-result" hidden aria-labelledby="result-title">
        <div class="check-result-card"><h2 id="result-title" tabindex="-1">診断結果</h2>
        <p class="check-score"><span id="check-score"></span><span> / 36点</span></p>
        <div id="check-description"></div><p class="fine-print">${escape(copy.notice)}</p>
        <button class="button secondary" type="button" id="check-edit">回答を見直す</button></div>
        ${invitation}
      </section>${templates}
    </section></div>`;
};
