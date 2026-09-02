from pathlib import Path

path = Path("frontend/src/pages/Study.tsx")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match, found {count}: {old[:90]!r}")
    text = text.replace(old, new, 1)


replace_once(
    '  const [showAnswer, setShowAnswer] = useState(false);\n  const [showFullAnswer, setShowFullAnswer] = useState(false);',
    '  const [showAnswer, setShowAnswer] = useState(false);\n  const [typedAnswer, setTypedAnswer] = useState("");\n  const [showFullAnswer, setShowFullAnswer] = useState(false);',
)

replace_once(
    '        setShowHint(false);\n        setShowAnswer(false);\n        setShowFullAnswer(false);',
    '        setShowHint(false);\n        setShowAnswer(false);\n        setTypedAnswer("");\n        setShowFullAnswer(false);',
)

replace_once(
    '            Think first, ask for a hint if you want one, reveal the short answer, then dig deeper.',
    '            Commit to an answer first, ask for a hint if you want one, reveal the reference answer, then rate your recall.',
)

replace_once(
    '["2", "👀", "Think", "Try it in your head first."],\n            ["3", "💡", "Hint", "Ask for a nudge if you need it."],\n            ["4", "✨", "Reveal", "Get the TL;DR, then full answer."],',
    '["2", "✍️", "Answer", "Write what you think before revealing."],\n            ["3", "💡", "Hint", "Ask for a nudge if you need it."],\n            ["4", "✨", "Reveal", "Compare your answer with the reference."],',
)

replace_once(
    '      if (event.key === " ") {\n        event.preventDefault();\n        setShowAnswer(true);\n      }',
    '      if (event.key === " " && typedAnswer.trim()) {\n        event.preventDefault();\n        setShowAnswer(true);\n      }',
)

replace_once(
    '  }, [data, loading, answer, skipCard]);',
    '  }, [data, loading, answer, skipCard, typedAnswer]);',
)

replace_once(
    '''                {!showAnswer && (\n                  <div className="mt-8 flex flex-wrap justify-center gap-3">\n                    <button''',
    '''                {!showAnswer && (\n                  <div className="mx-auto mt-8 grid max-w-2xl gap-4 text-left">\n                    <label className="grid gap-2">\n                      <span className="text-sm font-black text-white">Your answer</span>\n                      <textarea\n                        className="game-input min-h-28 resize-y"\n                        value={typedAnswer}\n                        onChange={(event) => setTypedAnswer(event.target.value)}\n                        placeholder="Commit to your answer before you reveal it…"\n                      />\n                    </label>\n                    <div className="flex flex-wrap justify-center gap-3">\n                    <button''',
)

replace_once(
    '''                    <button\n                      className="game-button bg-[#ffba08] px-6 py-3 font-black text-[#370617]"\n                      onClick={() => setShowAnswer(true)}\n                    >\n                      ✨ Reveal answer\n                    </button>\n                  </div>\n                )}''',
    '''                    <button\n                      className="game-button bg-[#ffba08] px-6 py-3 font-black text-[#370617] disabled:cursor-not-allowed disabled:opacity-50"\n                      onClick={() => setShowAnswer(true)}\n                      disabled={!typedAnswer.trim()}\n                    >\n                      ✨ Reveal answer\n                    </button>\n                    </div>\n                  </div>\n                )}''',
)

replace_once(
    '''                {showAnswer && (\n                  <div className="mx-auto mt-8 grid max-w-2xl gap-4 text-left">\n                    <div className="answer-pop rounded-2xl border border-cyan-300/30 bg-cyan-300/[0.08] p-5">''',
    '''                {showAnswer && (\n                  <div className="mx-auto mt-8 grid max-w-2xl gap-4 text-left">\n                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">\n                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">You answered</p>\n                      <p className="mt-3 whitespace-pre-wrap text-base font-bold leading-7 text-white">{typedAnswer}</p>\n                    </div>\n                    <div className="answer-pop rounded-2xl border border-cyan-300/30 bg-cyan-300/[0.08] p-5">''',
)

rating_old = '''          <div className="grid gap-3 sm:grid-cols-3">\n            <button\n              className="game-button border border-[#d00000]/40 bg-[#6a040f]/45 px-5 py-4 text-left text-rose-100"\n              onClick={() => void answer("wrong")}\n              disabled={loading}\n            >\n              <b className="block text-sm">1 · Missed it</b>\n              <span className="mt-1 block text-xs text-rose-200/70">Bring it back sooner</span>\n            </button>\n            <button\n              className="game-button border border-[#faa307]/40 bg-[#e85d04]/20 px-5 py-4 text-left text-[#ffba08]"\n              onClick={() => void answer("correct")}\n              disabled={loading}\n            >\n              <b className="block text-sm">2 · Got it</b>\n              <span className="mt-1 block text-xs text-[#ffba08]/70">Advance mastery + combo</span>\n            </button>\n            <button\n              className="game-button border border-white/10 bg-white/[0.04] px-5 py-4 text-left text-slate-200"\n              onClick={() => void skipCard()}\n              disabled={loading}\n            >\n              <b className="block text-sm">S · Skip</b>\n              <span className="mt-1 block text-xs text-slate-500">Draw a different eligible card</span>\n            </button>\n          </div>'''

rating_new = '''          {showAnswer ? (\n            <div className="grid gap-3">\n              <div className="rounded-2xl border border-[#ffba08]/25 bg-[#ffba08]/[0.08] p-4 text-center">\n                <h3 className="text-lg font-black text-white">Did you get it?</h3>\n                <p className="mt-1 text-xs text-slate-400">Compare your answer with the reference, then rate your recall.</p>\n              </div>\n              <div className="grid gap-3 sm:grid-cols-3">\n                <button\n                  className="game-button border border-[#d00000]/40 bg-[#6a040f]/45 px-5 py-4 text-left text-rose-100"\n                  onClick={() => void answer("wrong")}\n                  disabled={loading}\n                >\n                  <b className="block text-sm">1 · Missed it</b>\n                  <span className="mt-1 block text-xs text-rose-200/70">Bring it back sooner</span>\n                </button>\n                <button\n                  className="game-button border border-[#faa307]/40 bg-[#e85d04]/20 px-5 py-4 text-left text-[#ffba08]"\n                  onClick={() => void answer("correct")}\n                  disabled={loading}\n                >\n                  <b className="block text-sm">2 · Got it</b>\n                  <span className="mt-1 block text-xs text-[#ffba08]/70">Advance mastery + combo</span>\n                </button>\n                <button\n                  className="game-button border border-white/10 bg-white/[0.04] px-5 py-4 text-left text-slate-200"\n                  onClick={() => void skipCard()}\n                  disabled={loading}\n                >\n                  <b className="block text-sm">S · Skip</b>\n                  <span className="mt-1 block text-xs text-slate-500">Draw a different eligible card</span>\n                </button>\n              </div>\n            </div>\n          ) : (\n            <button\n              className="game-button border border-white/10 bg-white/[0.04] px-5 py-4 text-left text-slate-200"\n              onClick={() => void skipCard()}\n              disabled={loading}\n            >\n              <b className="block text-sm">S · Skip</b>\n              <span className="mt-1 block text-xs text-slate-500">Draw a different eligible card</span>\n            </button>\n          )}'''
replace_once(rating_old, rating_new)

path.write_text(text, encoding="utf-8")
print("Patched Study.tsx for answer-first recall")
