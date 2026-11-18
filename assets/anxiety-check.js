'use strict';

(() => {
  const form = document.getElementById('anxiety-form');
  if (!form) return;
  const questions = [...form.querySelectorAll('[data-question]')];
  const result = document.getElementById('check-result');
  const error = document.getElementById('check-error');
  const update = document.getElementById('check-update');
  const templates = [...document.querySelectorAll('template[data-max]')];
  const selection = question => question.querySelector('input:checked');

  function refresh() {
    const answered = questions.filter(selection).length;
    document.getElementById('check-progress').textContent = answered + ' / 12問 回答済み';
    questions.forEach(question => {
      if (selection(question)) {
        question.classList.remove('check-missing');
        question.querySelectorAll('input').forEach(input => input.removeAttribute('aria-invalid'));
      }
    });
    error.textContent = '';
    if (!result.hidden) {
      result.hidden = true;
      document.getElementById('check-description').replaceChildren();
      document.getElementById('check-score').textContent = '';
      update.textContent = '回答を変更しました。「診断結果を見る」で再採点してください。';
    }
  }

  function calculate() {
    const missing = questions.filter(question => !selection(question));
    if (missing.length) {
      result.hidden = true;
      error.textContent = '未回答の質問があります：' + missing.map(q => 'Q' + q.dataset.question).join('、');
      missing.forEach(question => {
        question.classList.add('check-missing');
        question.querySelectorAll('input').forEach(input => input.setAttribute('aria-invalid', 'true'));
      });
      missing[0].querySelector('input').focus();
      return;
    }
    const score = questions.reduce((sum, question) => {
      const value = Number(selection(question).value);
      return sum + (question.dataset.reverse === 'true' ? 3 - value : value);
    }, 0);
    const template = templates.find(item => score <= Number(item.dataset.max));
    error.textContent = '';
    update.textContent = '';
    document.getElementById('check-score').textContent = String(score);
    document.getElementById('check-description').replaceChildren(template.content.cloneNode(true));
    result.hidden = false;
    document.getElementById('result-title').focus();
  }

  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('change', refresh);
  document.getElementById('check-submit').addEventListener('click', calculate);
  document.getElementById('check-edit').addEventListener('click', () => {
    (selection(questions[0]) || questions[0].querySelector('input')).focus();
  });
  window.addEventListener('pageshow', () => {
    form.reset();
    result.hidden = true;
    update.textContent = '';
    questions.forEach(q => q.classList.remove('check-missing'));
    form.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
    refresh();
  });
  document.getElementById('check-controls').disabled = false;
})();
