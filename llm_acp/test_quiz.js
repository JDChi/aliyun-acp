const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');
const crypto = require('crypto');
const html = fs.readFileSync(path.join(__dirname, '刷题.html'), 'utf8');
const json = html.match(/<script id="quiz-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
const script = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/)[1];
const papers = JSON.parse(json);
const expectedIds = ['C2', 'C3', 'C4', 'C5', 'ALL', 'C2-2.0', 'C2-2.1', 'C2-2.2', 'C2-2.3', 'C2-2.4', 'C2-2.5',
  'C3-3.0', 'C3-3.1', 'C3-3.2', 'C3-3.3', 'C3-3.4', 'C3-3.5', 'C3-3.6', 'C3-3.7', 'C3-3.8',
  'C4-4.0', 'C4-4.1', 'C4-4.2', 'C4-4.3', 'C4-4.4', 'C5-5.1', 'C5-5.2'];
assert.deepStrictEqual(papers.map(p => p.id), expectedIds);
const bankFiles = ['C2-构造问答系统-75题.md', 'C3-构建Agent系统-75题.md', 'C4-交付上线-75题.md', 'C5-总结与展望-10题.md', '综合卷-75题.md'];
papers.slice(0, 5).forEach((paper, index) => {
  const source = fs.readFileSync(path.join(__dirname, bankFiles[index]));
  assert.strictEqual(paper.version, crypto.createHash('sha256').update(source).digest('hex').slice(0, 12));
});
papers.forEach((paper, index) => {
  const filename = index < 5 ? bankFiles[index] : fs.readdirSync(path.join(__dirname, '课时题库')).find(name => name.startsWith(`${paper.id}-`) && name.endsWith('.md'));
  const file = index < 5 ? path.join(__dirname, filename) : path.join(__dirname, '课时题库', filename);
  const source = fs.readFileSync(file, 'utf8');
  assert.strictEqual(paper.version, crypto.createHash('sha256').update(source).digest('hex').slice(0, 12));
  const questions = [...source.matchAll(/^\*\*(\d+)\.\*\* (.+)\n([ABCD]\. .+)$/gm)];
  const answers = new Map(source.split('\n').filter(line => /^\|\s*\d+\s*\|\s*[A-D]+\s*\|/.test(line)).map(line => {
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    return [Number(cells[0]), {answer:cells[1], explanation:cells[cells.length - 1]}];
  }));
  assert.strictEqual(questions.length, paper.questions.length, paper.id);
  paper.questions.forEach((q, i) => {
    const [, number, stem, optionLine] = questions[i];
    assert.strictEqual(Number(number), q.number, paper.id);
    assert.strictEqual(stem, q.stem, `${paper.id} ${q.number}`);
    assert.deepStrictEqual(optionLine.split('　').map(part => part.slice(3)), q.options, `${paper.id} ${q.number}`);
    assert.deepStrictEqual(q.answer, [...answers.get(q.number).answer], `${paper.id} ${q.number}`);
    assert.strictEqual(q.explanation, answers.get(q.number).explanation, `${paper.id} ${q.number}`);
  });
});
assert(papers.find(paper => paper.id === 'C2').previousVersions.length);
assert(papers.find(paper => paper.id === 'C2-2.2').previousVersions.length);
assert(!papers.some(paper => paper.questions.some(q => /上述|课程|本课|本节|本章|公开预览|本地 3\.8 预览/.test(q.stem))));
assert.deepStrictEqual(papers.slice(5).map(p => p.questions.length), [6, 30, 24, 30, 30, 30, 6, 20, 20, 12, 15, 18, 12, 15, 6, 6, 30, 20, 20, 20, 5, 12]);
const expectedMultiDistribution = [[11, 12, 2], [11, 12, 2], [11, 9, 5], [2, 2, 0], [14, 6, 5], [1, 1, 0], [5, 5, 0], [4, 3, 1], [5, 4, 1], [5, 5, 0], [5, 5, 0]];
papers.slice(0, 11).forEach((paper, index) => {
  const multi = paper.questions.filter(q => q.kind === 'multi');
  assert.deepStrictEqual([2, 3, 4].map(n => multi.filter(q => q.answer.length === n).length), expectedMultiDistribution[index]);
  assert(paper.previousVersion && paper.revisedQuestions.length);
});
for (const paper of papers) {
  for (const q of paper.questions) {
    assert.strictEqual(q.options.length, 4);
    assert(q.options.every(Boolean));
    assert(q.stem && q.explanation);
    assert(q.answer.every(letter => 'ABCD'.includes(letter)));
    assert.strictEqual(q.kind === 'single' ? q.answer.length : q.answer.length >= 2, q.kind === 'single' ? 1 : true);
  }
}
const kv = new Map();
let now = 0;
const localStorage = {
  getItem(key) { return kv.has(key) ? kv.get(key) : null; },
  setItem(key, value) { kv.set(key, String(value)); },
  removeItem(key) { kv.delete(key); }
};
function mount(store = localStorage) {
  const app = {
    innerHTML: '',
    handlers: {},
    addEventListener(type, handler) { this.handlers[type] = handler; },
    querySelectorAll(selector) {
      if (selector === 'input[name="choice"]:checked') return (this.selected || []).map(value => ({value}));
      if (selector === '.choice') return [];
      return [];
    },
    querySelector() { return {disabled: false}; }
  };
  const brand = {addEventListener() {}};
  const document = {visibilityState:'visible', handlers:{}, addEventListener(type, handler) { this.handlers[type] = handler; }, getElementById(id) {
    if (id === 'quiz-data') return {textContent: json};
    if (id === 'app') return app;
    if (id === 'brand-home') return brand;
    return null;
  }};
  let timerCallback = null;
  const context = {document, localStorage: store, requestAnimationFrame() {}, setInterval(callback){timerCallback = callback; return 1;}, clearInterval(){timerCallback = null;}, Date:{now(){return now;}}, console};
  vm.runInNewContext(script, context);
  return {
    app,
    tick() { if (timerCallback) timerCallback(); },
    hide() { document.visibilityState = 'hidden'; document.handlers.visibilitychange(); },
    show() { document.visibilityState = 'visible'; document.handlers.visibilitychange(); },
    click(action, id) {
      app.handlers.click({target:{closest(){return {getAttribute(name){return name === 'data-action' ? action : id;}};}}});
    },
    choose(...letters) {
      app.selected = letters;
      app.handlers.change({target:{name:'choice'}});
    }
  };
}
let ui = mount();
assert(ui.app.innerHTML.includes('C2 · 构造问答系统'));
assert(ui.app.innerHTML.includes('C5 · 总结与展望'));
assert(ui.app.innerHTML.includes('按课时练习'));
assert(ui.app.innerHTML.includes('<h3 class="lesson-group-title">C2 · 构造问答系统<span>6 节课</span></h3>'));
assert(ui.app.innerHTML.includes('<h3 class="lesson-group-title">C3 · 构建 Agent 系统<span>9 节课</span></h3>'));
assert(ui.app.innerHTML.includes('<h3 class="lesson-group-title">C4 · 交付上线<span>5 节课</span></h3>'));
assert(ui.app.innerHTML.includes('<h3 class="lesson-group-title">C5 · 总结与展望<span>2 节课</span></h3>'));
ui.click('open', 'C5');
assert(ui.app.innerHTML.includes('用时 <time id="timer-value">00:00:00</time>'));
now = 5000; ui.tick();
ui.hide(); now = 12000; ui.show();
ui.click('home');
ui.click('open', 'C5');
assert(ui.app.innerHTML.includes('用时 <time id="timer-value">00:00:05</time>'));
assert(ui.app.innerHTML.includes('第 1 题 / 共 10 题'));
let c5 = papers.find(p => p.id === 'C5');
ui.choose(...c5.questions[0].answer);
ui.click('submit');
assert(ui.app.innerHTML.includes('回答正确'));
assert(ui.app.innerHTML.includes('答对 1 题'));
ui.click('next');
assert(ui.app.innerHTML.includes('第 2 题 / 共 10 题'));
ui.click('previous');
assert(ui.app.innerHTML.includes('第 1 题 / 共 10 题'));
assert(ui.app.innerHTML.includes('回答正确'));
assert(ui.app.innerHTML.includes('答对 1 题'));
ui.click('next');
assert(ui.app.innerHTML.includes('第 2 题 / 共 10 题'));
ui = mount();
ui.click('open', 'C5');
assert(ui.app.innerHTML.includes('第 2 题 / 共 10 题'));
assert(ui.app.innerHTML.includes('答对 1 题'));
now = 15000; ui.tick();
assert(JSON.parse(kv.get([...kv.keys()].find(key => key.startsWith('acp-quiz:C5:')))).elapsedMs === 8000);
for (let i = 1; i < 6; i++) {
  ui.choose(...c5.questions[i].answer);
  ui.click('submit');
  ui.click('next');
}
assert(ui.app.innerHTML.includes('第 7 题 / 共 10 题'));
ui.choose(c5.questions[6].answer[0]);
ui.click('submit');
assert(ui.app.innerHTML.includes('回答错误'));
ui.click('next');
for (let i = 7; i < 10; i++) {
  ui.choose(...c5.questions[i].answer);
  ui.click('submit');
  ui.click('next');
}
assert(ui.app.innerHTML.includes('9 / 10'));
assert(ui.app.innerHTML.includes('用时 00:00:08'));
assert(ui.app.innerHTML.includes('错题 1 道'));
assert(ui.app.innerHTML.includes('<details class="wrong-item" open>'));
assert(ui.app.innerHTML.includes('class="wrong-stem">' + c5.questions[6].stem));
for (const option of c5.questions[6].options) assert(ui.app.innerHTML.includes(option));
assert(ui.app.innerHTML.includes('正确选项'));
assert(ui.app.innerHTML.includes('解析：'));
ui.click('home');
assert(ui.app.innerHTML.includes('class="paper-result neutral">最近正确率 90% · 答对 9 / 10 题'));
ui.click('open', 'C5');

ui.click('previous');
assert(ui.app.innerHTML.includes('第 10 题 / 共 10 题'));
assert(ui.app.innerHTML.includes('回答正确'));
ui.click('next');
assert(ui.app.innerHTML.includes('9 / 10'));
ui.click('restart');
assert(ui.app.innerHTML.includes('第 1 题 / 共 10 题'));
assert(ui.app.innerHTML.includes('用时 <time id="timer-value">00:00:00</time>'));
ui.click('home');
assert(ui.app.innerHTML.includes('已完成 0 / 10'));
assert(ui.app.innerHTML.includes('class="paper-result neutral">最近正确率 90% · 答对 9 / 10 题'));
ui.click('open', 'C2');
ui.choose(...papers.find(p => p.id === 'C2').questions[0].answer);
ui.click('submit');
ui.click('home');
ui.click('open', 'C5');
assert(ui.app.innerHTML.includes('答对 0 题'));
ui.click('home');
ui.click('open', 'C2');
assert(ui.app.innerHTML.includes('答对 1 题'));
const scored = mount();
const c3 = papers.find(p => p.id === 'C3');
scored.click('open', 'C3');
let correctMulti = 0;
for (let i = 0; i < c3.questions.length; i++) {
  const q = c3.questions[i];
  if (q.kind === 'multi') {
    assert(scored.app.innerHTML.includes('当前题型：多选'));
    assert(scored.app.innerHTML.includes('提交多选答案'));
    assert(scored.app.innerHTML.includes(i === 0 || c3.questions[i - 1].kind !== 'multi' ? '题型切换：现在进入多选题' : '注意：本题是多选题'));
  } else {
    assert(!scored.app.innerHTML.includes('class="type-alert"'));
  }
  const shouldCorrect = q.kind === 'single' || correctMulti < 15;
  if (q.kind === 'multi' && shouldCorrect) correctMulti++;
  scored.choose(...(shouldCorrect ? q.answer : (q.answer.length === 4 ? ['A'] : ['A', 'B', 'C', 'D'].filter(letter => !q.answer.includes(letter)).slice(0, 1))));
  scored.click('submit');
  scored.click('next');
}
assert(scored.app.innerHTML.includes('80 / 100'));
assert(scored.app.innerHTML.includes('达到 80 分练习参考线'));
assert(scored.app.innerHTML.includes('答对 65 / 75 题'));
scored.click('home');
assert(scored.app.innerHTML.includes('class="paper-result passed">最近得分 80 / 100 · 通过'));
scored.click('open', 'C3');
scored.click('restart');
scored.click('home');
assert(scored.app.innerHTML.includes('class="paper-result passed">最近得分 80 / 100 · 通过'));
const resumedScore = mount();
assert(resumedScore.app.innerHTML.includes('class="paper-result passed">最近得分 80 / 100 · 通过'));
resumedScore.click('open', 'C3');
assert(resumedScore.app.innerHTML.includes('第 1 题 / 共 75 题'));
const c4 = papers.find(p => p.id === 'C4');
const failedResponses = Object.fromEntries(c4.questions.map((q, i) => [i, {
  selected:[q.answer.length === 4 ? 'A' : 'ABCD'.split('').find(letter => !q.answer.includes(letter))], submitted:true
}]));
kv.set(`acp-quiz:C4:${c4.version}`, JSON.stringify({cursor:75, responses:failedResponses, elapsedMs:0, finished:true}));
const failed = mount();
assert(failed.app.innerHTML.includes('class="paper-result failed">最近得分 0 / 100 · 未通过'));
assert(JSON.parse(kv.get(`acp-quiz:C4:${c4.version}`)).latestResult.score === 0);
const lesson = papers.find(p => p.id === 'C2-2.0');
let lessonUI = mount();
lessonUI.click('open', lesson.id);
assert(lessonUI.app.innerHTML.includes('第 1 题 / 共 6 题'));
const wrongLetter = 'ABCD'.split('').find(letter => !lesson.questions[0].answer.includes(letter));
lessonUI.choose(wrongLetter);
lessonUI.click('submit');
assert(lessonUI.app.innerHTML.includes('回答错误'));
lessonUI.click('next');
lessonUI.click('previous');
assert(lessonUI.app.innerHTML.includes('回答错误'));
lessonUI.click('next');
for (let i = 1; i < lesson.questions.length; i++) {
  lessonUI.choose(...lesson.questions[i].answer);
  lessonUI.click('submit');
  lessonUI.click('next');
}
assert(lessonUI.app.innerHTML.includes('5 / 6'));
assert(lessonUI.app.innerHTML.includes('正确率 83%'));
assert(!lessonUI.app.innerHTML.includes('80 分练习参考线'));
assert(lessonUI.app.innerHTML.includes(lesson.questions[0].stem));
for (const option of lesson.questions[0].options) assert(lessonUI.app.innerHTML.includes(option));
lessonUI.click('home');
assert(lessonUI.app.innerHTML.includes('class="paper-result neutral">最近正确率 83% · 答对 5 / 6 题'));
lessonUI.click('open', 'C2-2.1');
const first2_1 = papers.find(p => p.id === 'C2-2.1').questions[0];
lessonUI.choose(...first2_1.answer);
lessonUI.click('submit');
lessonUI.click('next');
lessonUI = mount();
lessonUI.click('open', 'C2-2.1');
assert(lessonUI.app.innerHTML.includes('第 2 题 / 共 30 题'));
lessonUI.click('home');
assert(lessonUI.app.innerHTML.includes('已完成 6 / 6'));
assert(lessonUI.app.innerHTML.includes('已完成 1 / 30'));
assert(lessonUI.app.innerHTML.includes('已完成 1 / 75'));
for (const paper of papers.slice(11)) {
  let practice = mount();
  practice.click('open', paper.id);
  assert(practice.app.innerHTML.includes(`第 1 题 / 共 ${paper.questions.length} 题`), paper.id);
  practice.choose(...paper.questions[0].answer);
  practice.click('submit');
  practice.click('next');
  practice = mount();
  practice.click('open', paper.id);
  assert(practice.app.innerHTML.includes(`第 2 题 / 共 ${paper.questions.length} 题`), paper.id);
  for (let i = 1; i < paper.questions.length; i++) {
    practice.choose(...paper.questions[i].answer);
    practice.click('submit');
    practice.click('next');
  }
  assert(practice.app.innerHTML.includes(`class="summary-number">${paper.questions.length} / ${paper.questions.length}</div>`), paper.id);
  assert(practice.app.innerHTML.includes('正确率 100%'), paper.id);
  assert(!practice.app.innerHTML.includes('80 分练习参考线'), paper.id);
}
const blocked = {getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};
const offline = mount(blocked);
assert(offline.app.innerHTML.includes('无法恢复进度'));
offline.click('open', 'C5');
offline.choose(...c5.questions[0].answer);
offline.click('submit');
assert(offline.app.innerHTML.includes('回答正确'));
offline.click('next');
offline.choose('ABCD'.split('').find(letter => !c5.questions[1].answer.includes(letter)));
offline.click('submit');
offline.click('wrongbook');
assert(offline.app.innerHTML.includes('已收录 1 道'));
assert(offline.app.innerHTML.includes('无法恢复进度、用时和错题集'));
for (const paperId of ['C2', 'C2-2.0']) {
  const paper = papers.find(p => p.id === paperId);
  const changed = paper.revisedQuestions[0];
  const oldKey = `acp-quiz:${paper.id}:${paper.previousVersion}`;
  const newKey = `acp-quiz:${paper.id}:${paper.version}`;
  kv.delete(newKey);
  kv.set(oldKey, JSON.stringify({cursor:changed + 1, responses:{0:{selected:paper.questions[0].answer, submitted:true}, [changed]:{selected:['A','B','C'], submitted:true}}, elapsedMs:5000, finished:false}));
  const migrated = mount();
  migrated.click('open', paper.id);
  assert(migrated.app.innerHTML.includes(`第 ${changed + 1} 题 / 共 ${paper.questions.length} 题`));
  assert(migrated.app.innerHTML.includes('用时 <time id="timer-value">00:00:05</time>'));
  const restored = JSON.parse(kv.get(newKey));
  assert(restored.responses['0'].submitted);
  assert(!restored.responses[String(changed)]);
  assert.strictEqual(restored.elapsedMs, 5000);
  assert(kv.has(oldKey));
}
const rewritten = papers.find(p => p.id === 'C2');
const olderVersion = rewritten.previousVersions.find(item => item.version === '5577cc4f627e');
assert(olderVersion && !olderVersion.revisedQuestions.length);
const rewrittenQuestion = rewritten.questions[17];
const oldStem = '对上述多轮 RAG 问题，课程推荐的处理方式是？';
const oldWrongKey = JSON.stringify([rewrittenQuestion.kind, oldStem, rewrittenQuestion.options, rewrittenQuestion.answer]);
const legacyWrong = {key:oldWrongKey, question:{...rewrittenQuestion, stem:oldStem}, sources:[rewritten.title],
  wrongCount:1, reviewCount:0, mastered:false, lastSelected:['B'], lastWrongAt:100};
const migrationKV = new Map([
  [`acp-quiz:C2:${olderVersion.version}`, JSON.stringify({cursor:18, responses:{17:{selected:['B'], submitted:true}}, elapsedMs:6000, finished:false})],
  ['acp-quiz:wrongbook:v1', JSON.stringify({items:[legacyWrong], seen:{[`C2:${oldWrongKey}:B`]:true}, review:{keys:[oldWrongKey], state:{cursor:0, responses:{}, elapsedMs:0, finished:false}}})]
]);
const migrationStore = {getItem(key){return migrationKV.get(key) || null},setItem(key,value){migrationKV.set(key,String(value))},removeItem(key){migrationKV.delete(key)}};
const migratedStemUI = mount(migrationStore);
migratedStemUI.click('open', 'C2');
assert(migratedStemUI.app.innerHTML.includes('第 19 题 / 共 75 题'));
assert(JSON.parse(migrationKV.get(`acp-quiz:C2:${rewritten.version}`)).responses['17'].submitted);
const migratedWrong = JSON.parse(migrationKV.get('acp-quiz:wrongbook:v1'));
assert.strictEqual(migratedWrong.items.length, 1);
assert.strictEqual(migratedWrong.items[0].wrongCount, 1);
assert.strictEqual(migratedWrong.items[0].question.stem, rewrittenQuestion.stem);
assert.strictEqual(migratedWrong.review.keys[0], migratedWrong.items[0].key);
const wrongKV = new Map();
const wrongStore = {
  getItem(key) { return wrongKV.has(key) ? wrongKV.get(key) : null; },
  setItem(key, value) { wrongKV.set(key, String(value)); },
  removeItem(key) { wrongKV.delete(key); }
};
const c2 = papers.find(p => p.id === 'C2');
const c2Lesson = papers.find(p => p.id === 'C2-2.1');
assert.strictEqual(c2.questions[50].stem, c2Lesson.questions[20].stem);
wrongKV.set(`acp-quiz:C2:${c2.version}`, JSON.stringify({cursor:0, responses:{50:{selected:['A'], submitted:true}}, elapsedMs:9000, finished:false}));
wrongKV.set(`acp-quiz:C2-2.1:${c2Lesson.version}`, JSON.stringify({cursor:0, responses:{20:{selected:['A'], submitted:true}}, elapsedMs:3000, finished:false}));
let wrongUI = mount(wrongStore);
let wrongData = JSON.parse(wrongKV.get('acp-quiz:wrongbook:v1'));
assert.strictEqual(wrongData.items.length, 1);
assert.strictEqual(wrongData.items[0].wrongCount, 2);
assert.strictEqual(wrongData.items[0].sources.length, 2);
wrongUI = mount(wrongStore);
assert.strictEqual(JSON.parse(wrongKV.get('acp-quiz:wrongbook:v1')).items[0].wrongCount, 2);
assert(wrongUI.app.innerHTML.includes('已收录 1 道 · 待巩固 1 道'));
wrongUI.click('wrongbook');
assert(wrongUI.app.innerHTML.includes(c2.questions[50].stem));
for (const option of c2.questions[50].options) assert(wrongUI.app.innerHTML.includes(option));
assert(wrongUI.app.innerHTML.includes('正确答案：'));
assert(wrongUI.app.innerHTML.includes('解析：'));
wrongUI.click('review-pending');
assert(wrongUI.app.innerHTML.includes('第 1 题 / 共 1 题'));
wrongUI.choose(...c2.questions[50].answer);
wrongUI.click('submit');
assert(wrongUI.app.innerHTML.includes('已标记为已掌握'));
wrongUI.click('next');
wrongUI.click('wrongbook');
assert(wrongUI.app.innerHTML.includes('已收录 1 道 · 待巩固 0 道'));
assert(wrongUI.app.innerHTML.includes('已掌握'));
wrongUI.click('review-all');
wrongUI.choose(c2.questions[50].answer[0]);
wrongUI.click('submit');
assert(wrongUI.app.innerHTML.includes('回答错误'));
assert(wrongUI.app.innerHTML.includes('仍标记为待巩固'));
wrongUI.click('next');
wrongUI.click('wrongbook');
wrongData = JSON.parse(wrongKV.get('acp-quiz:wrongbook:v1'));
assert.strictEqual(wrongData.items[0].wrongCount, 3);
assert.strictEqual(wrongData.items[0].mastered, false);
assert(wrongUI.app.innerHTML.includes('待巩固 1 道'));
const freshWrongKV = new Map();
const freshWrongStore = {
  getItem(key) { return freshWrongKV.has(key) ? freshWrongKV.get(key) : null; },
  setItem(key, value) { freshWrongKV.set(key, String(value)); },
  removeItem(key) { freshWrongKV.delete(key); }
};
let freshWrongUI = mount(freshWrongStore);
freshWrongUI.click('wrongbook');
assert(freshWrongUI.app.innerHTML.includes('还没有错题'));
freshWrongUI.click('home');
freshWrongUI.click('open', 'C5');
for (let i = 0; i < 2; i++) {
  const wrongAnswer = 'ABCD'.split('').find(letter => !c5.questions[i].answer.includes(letter));
  freshWrongUI.choose(wrongAnswer);
  freshWrongUI.click('submit');
  assert(freshWrongUI.app.innerHTML.includes('已自动收录到错题集'));
  freshWrongUI.click('next');
}
freshWrongUI.click('wrongbook');
assert(freshWrongUI.app.innerHTML.includes('已收录 2 道 · 待巩固 2 道'));
freshWrongUI.click('review-pending');
const firstReviewQuestion = JSON.parse(freshWrongKV.get('acp-quiz:wrongbook:v1')).items[0].question;
freshWrongUI.choose(...firstReviewQuestion.answer);
freshWrongUI.click('submit');
freshWrongUI.click('next');
freshWrongUI = mount(freshWrongStore);
freshWrongUI.click('wrongbook');
assert(freshWrongUI.app.innerHTML.includes('继续上次重练'));
freshWrongUI.click('resume-review');
assert(freshWrongUI.app.innerHTML.includes('第 2 题 / 共 2 题'));
console.log('UI state flow OK: chapter and lesson papers, scoring, navigation, timer, persistence, wrong review');
