"""将 C2—C5 课时 Markdown 题库嵌入可离线打开的刷题.html。

用法：在本仓库根目录运行 python3 llm_acp/build_quiz.py；
      在 agent-learning 根目录运行 python3 exams/llm_acp/build_quiz.py。
章节卷、综合卷与课时卷均从 Markdown 重建；纯题干改写保留已有答题进度。
"""

from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from pathlib import Path


ROOT = Path(__file__).resolve().parent
HTML = ROOT / "刷题.html"
LESSON_DIR = ROOT / "课时题库"
DATA_RE = re.compile(r'(<script id="quiz-data" type="application/json">)(.*?)(</script>)', re.S)
QUESTION_RE = re.compile(r"^\*\*(\d+)\.\*\*\s+(.+)$", re.M)
ANSWER_RE = re.compile(r"^\|\s*(\d+)\s*\|\s*([A-D]+)\s*\|\s*(.*?)\s*\|$", re.M)
EXPECTED = {
    "C2-2.0": (4, 2), "C2-2.1": (20, 10), "C2-2.2": (16, 8),
    "C2-2.3": (20, 10), "C2-2.4": (20, 10), "C2-2.5": (20, 10),
    "C3-3.0": (4, 2), "C3-3.1": (13, 7), "C3-3.2": (13, 7),
    "C3-3.3": (8, 4), "C3-3.4": (10, 5), "C3-3.5": (12, 6),
    "C3-3.6": (8, 4), "C3-3.7": (10, 5), "C3-3.8": (4, 2),
    "C4-4.0": (4, 2), "C4-4.1": (20, 10), "C4-4.2": (13, 7),
    "C4-4.3": (14, 6), "C4-4.4": (13, 7),
    "C5-5.1": (4, 1), "C5-5.2": (8, 4),
}
LEGACY_IDS = ("C2", "C3", "C4", "C5", "ALL")
LEGACY_FILES = {
    "C2": "C2-构造问答系统-75题.md",
    "C3": "C3-构建Agent系统-75题.md",
    "C4": "C4-交付上线-75题.md",
    "C5": "C5-总结与展望-10题.md",
    "ALL": "综合卷-75题.md",
}


def version_history(previous: dict, changed: list[int]) -> list[dict]:
    history = [{"version": previous["version"], "revisedQuestions": changed}]
    history.extend(previous.get("previousVersions", []))
    if previous.get("previousVersion") and not any(item["version"] == previous["previousVersion"] for item in history):
        history.append({"version": previous["previousVersion"],
                        "revisedQuestions": previous.get("revisedQuestions", [])})
    return history


def parse_legacy(path: Path, previous: dict) -> dict:
    source = path.read_text(encoding="utf-8")
    matches = list(QUESTION_RE.finditer(source))
    answers = {int(number): (list(letters), explanation.split("|")[-1].strip())
               for number, letters, explanation in ANSWER_RE.findall(source)}
    if len(matches) != len(previous["questions"]):
        raise ValueError(f"{path.name} 题数变化，需重新核对")
    paper = deepcopy(previous)
    changed = []
    for index, found in enumerate(matches):
        number, stem = int(found.group(1)), found.group(2).strip()
        question = paper["questions"][index]
        if number != question["number"] or number not in answers:
            raise ValueError(f"{path.name} 第 {number} 题号或答案缺失")
        following = source[found.end():].lstrip("\n").splitlines()
        options = [part[3:].strip() for part in re.split(r"　(?=[ABCD]\. )", following[0])]
        answer, explanation = answers[number]
        if options != question["options"] or answer != question["answer"] or explanation != question["explanation"]:
            raise ValueError(f"{path.name} 第 {number} 题选项、答案或解析变化，需单独核对")
        question["stem"] = stem
    new_version = hashlib.sha256(source.encode("utf-8")).hexdigest()[:12]
    if new_version != previous["version"]:
        paper["previousVersions"] = version_history(previous, changed)
        paper["version"] = new_version
    return paper


def parse_lesson(path: Path) -> dict:
    source = path.read_text(encoding="utf-8")
    match = re.match(r"(C[2-5])-(\d+\.\d+)-(.+)\.md$", path.name)
    if not match:
        raise ValueError(f"课时文件名不符合规则：{path.name}")
    chapter, lesson, name = match.groups()
    paper_id = f"{chapter}-{lesson}"
    if paper_id not in EXPECTED or lesson.split(".")[0] != chapter[1:]:
        raise ValueError(f"课时不在预期范围：{path.name}")
    title_match = re.search(rf"^# {re.escape(lesson)} (.+)｜课时练习$", source, re.M)
    if title_match:
        name = title_match.group(1)
    answers = {int(number): (list(letters), explanation) for number, letters, explanation in ANSWER_RE.findall(source)}
    questions = []
    for found in QUESTION_RE.finditer(source):
        number, stem = int(found.group(1)), found.group(2).strip()
        following = source[found.end():].lstrip("\n").splitlines()
        if len(following) < 2:
            raise ValueError(f"{path.name} 第 {number} 题缺少选项或来源")
        parts = re.split(r"　(?=[ABCD]\. )", following[0])
        options = []
        for letter, part in zip("ABCD", parts):
            prefix = f"{letter}. "
            if not part.startswith(prefix):
                raise ValueError(f"{path.name} 第 {number} 题选项格式错误")
            options.append(part[len(prefix):].strip())
        if len(parts) != 4 or any(not option for option in options):
            raise ValueError(f"{path.name} 第 {number} 题需要四个非空选项")
        if not following[1].startswith("> 来源："):
            raise ValueError(f"{path.name} 第 {number} 题缺少来源")
        if number not in answers:
            raise ValueError(f"{path.name} 第 {number} 题缺少答案")
        answer, explanation = answers[number]
        if not explanation or not explanation.startswith(lesson + " "):
            raise ValueError(f"{path.name} 第 {number} 题简析缺少课时依据")
        if len(answer) != len(set(answer)) or not set(answer) <= set("ABCD"):
            raise ValueError(f"{path.name} 第 {number} 题答案无效")
        kind = "single" if len(answer) == 1 else "multi"
        if kind == "multi" and len(answer) < 2:
            raise ValueError(f"{path.name} 第 {number} 题多选答案不足")
        questions.append({"number": number, "kind": kind, "stem": stem,
                          "options": options, "answer": answer,
                          "explanation": explanation, "category": f"{chapter} · 课时练习",
                          "origin": following[1].removeprefix("> 来源：").strip()})
    if sorted(answers) != list(range(1, len(questions) + 1)) or [q["number"] for q in questions] != list(range(1, len(questions) + 1)):
        raise ValueError(f"{path.name} 题号或答案表不连续")
    counts = (sum(q["kind"] == "single" for q in questions), sum(q["kind"] == "multi" for q in questions))
    if counts != EXPECTED[paper_id] or len({q["stem"] for q in questions}) != len(questions):
        raise ValueError(f"{path.name} 题型数量不符或题干重复：{counts}")
    if [q["kind"] for q in questions] != ["single"] * counts[0] + ["multi"] * counts[1]:
        raise ValueError(f"{path.name} 单选与多选顺序错误")
    return {"id": paper_id, "title": f"{lesson} · {name}",
            "subtitle": f"{len(questions)} 题 · 单选 {counts[0]} / 多选 {counts[1]}",
            "version": hashlib.sha256(source.encode("utf-8")).hexdigest()[:12],
            "section": "lesson", "chapter": chapter, "questions": questions}


def main() -> None:
    html = HTML.read_text(encoding="utf-8")
    match = DATA_RE.search(html)
    if not match:
        raise ValueError("刷题.html 中找不到 quiz-data")
    current = json.loads(match.group(2))
    previous_legacy = [paper for paper in current if paper["id"] in LEGACY_IDS]
    if tuple(paper["id"] for paper in previous_legacy) != LEGACY_IDS:
        raise ValueError("现有五套试卷缺失或顺序变化")
    legacy = [parse_legacy(ROOT / LEGACY_FILES[paper["id"]], paper) for paper in previous_legacy]
    paths = sorted(LESSON_DIR.glob("C[2-5]-*.md"))
    lessons = [parse_lesson(path) for path in paths]
    current_lessons = {paper["id"]: paper for paper in current if paper.get("section") == "lesson"}
    for lesson in lessons:
        previous = current_lessons.get(lesson["id"])
        if previous:
            if previous.get("previousVersion"):
                lesson["previousVersion"] = previous["previousVersion"]
                lesson["revisedQuestions"] = previous.get("revisedQuestions", [])
            if previous["version"] != lesson["version"]:
                old_questions = previous["questions"]
                changed = [index for index, question in enumerate(lesson["questions"])
                           if any(question[key] != old_questions[index][key]
                                  for key in ("kind", "options", "answer", "explanation"))]
                lesson["previousVersions"] = version_history(previous, changed)
            elif previous.get("previousVersions"):
                lesson["previousVersions"] = previous["previousVersions"]
    if [paper["id"] for paper in lessons] != list(EXPECTED):
        raise ValueError("C2—C5 课时文件不齐全或顺序变化")
    source_questions = {f"{paper['id']}-{question['number']}": question
                        for paper in legacy if paper["id"] != "ALL" for question in paper["questions"]}
    for lesson in lessons:
        lesson_number = lesson["id"].split("-")[1]
        for question in lesson["questions"]:
            if not question["explanation"].startswith(lesson_number + " "):
                raise ValueError(f"{lesson['id']} 第 {question['number']} 题归属不符")
            origin = question["origin"]
            if origin.startswith("章节卷 "):
                source = source_questions.get(origin.removeprefix("章节卷 "))
                if source is None or any(question[key] != source[key] for key in ("kind", "stem", "options", "answer", "explanation")):
                    raise ValueError(f"{lesson['id']} 第 {question['number']} 题与章节原题不一致")
    payload = json.dumps(legacy + lessons, ensure_ascii=False, separators=(",", ":"))
    updated = html[:match.start(2)] + payload + html[match.end(2):]
    if updated != html:
        HTML.write_text(updated, encoding="utf-8")
    print("已嵌入：", ", ".join(f"{paper['id']} {len(paper['questions'])}题" for paper in lessons))


if __name__ == "__main__":
    main()
