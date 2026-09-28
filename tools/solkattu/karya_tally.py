"""Tally how karya's solkattu scores realize each phrase on the mridangam.

Reads every makeMridangam [...] list under Solkattu/Score in a karya checkout
(https://github.com/elaforge/karya) and prints a markdown table: the phrase,
how many times a composition overrode it, and its realizations, most common
first, in karya's stroke letters. docs/designs/solkattu.md quotes the output.

    git clone --depth 1 -b work https://github.com/elaforge/karya.git ../karya
    python3 tools/solkattu/karya_tally.py ../karya

Entries it can't read (named patterns, operators beyond . and __) are skipped,
so the counts are a lower bound. ROWS=n prints more or fewer rows.
"""

import collections
import glob
import os
import re
import sys

# Solkattu/Solkattu.hs, data Sollu.
SOLLUS = set(
    "cham dhom dom di din dim dit du ga gin gu jo ka ki ku kum lang mi na nam"
    " nang nu ri ta tam tang tat tha thom ti tong".split()
)

# Solkattu/Dsl/Solkattu.hs, the named fragments.
FRAGMENTS = {
    "tdgnt": "ta din gin na thom",
    "takadinna": "ta ka din na",
    "takita": "ta ki ta",
    "kita": "ki ta",
    "taka": "ta ka",
    "naka": "na ka",
    "tiku": "ti ku",
    "diku": "di ku",
    "tari": "ta ri",
    "gugu": "gu gu",
    "dugu": "du gu",
    "jonu": "jo nu",
    "kitataka": "ki ta ta ka",
    "tarikita": "ta ri ki ta",
    "tadikita": "ta di ki ta",
    "talang": "ta lang",
    "dinga": "din _ ga",
    "dingu": "din _ gu",
    "tanga": "tang _ ga",
    "langa": "lang _ ga",
}

# Stroke names in Solkattu/Dsl/Mridangam.hs, written with dots between them.
STROKE_IDS = {"k", "t", "r", "l", "n", "d", "u", "v", "i", "y", "j", "p", "o",
              "od", "on", "ou", "ok", "ot", "pk", "pt", "pu"}

# Stroke letters in a quoted string (Mridangam.parseString): uppercase is
# thom with that stroke, P and X are tha with ki and ta, A tha with arai chapu.
STROKE_CHARS = {c: c for c in "ktnduvipoyjl_"}
STROKE_CHARS.update({"N": "on", "D": "od", "U": "ou", "K": "ok", "T": "ot",
                     "P": "pk", "X": "pt", "A": "pu"})

REST = re.compile(r"__(\d?)")


def rests(token):
    """__ is one rest; __3 fills to three slots with the note before it."""
    n = REST.fullmatch(token).group(1)
    return ["_"] * (int(n) - 1 if n else 1)


def sollus(lhs):
    out = []
    for token in lhs.split("."):
        if token in SOLLUS:
            out.append(token)
        elif token in FRAGMENTS:
            out += FRAGMENTS[token].split()
        elif REST.fullmatch(token):
            out += rests(token)
        else:
            return None
    return out


def strokes(rhs):
    rhs = rhs.strip()
    if rhs.startswith('"'):
        chars = rhs.strip('"')
        if any(c not in STROKE_CHARS for c in chars):
            return None
        return [STROKE_CHARS[c] for c in chars]
    out = []
    for token in rhs.split("."):
        token = re.sub(r"^(lt|hv)\s+", "", token.strip())
        if REST.fullmatch(token):
            out += rests(token)
        elif token in STROKE_IDS:
            out.append(token)
        else:
            return None
    return out


def tally(root):
    pairs = collections.defaultdict(collections.Counter)
    for path in glob.glob(os.path.join(root, "Solkattu/Score/*.hs")):
        text = open(path, encoding="utf8").read()
        for block in re.finditer(r"makeMridangam0?\s*\$?\s*\[(.*?)\n\s*\]", text, re.S):
            for lhs, rhs in re.findall(r'\(\s*([a-z_.\d]+)\s*,\s*("[^"]*"|[a-z_.\' ]+?)\s*\)', block.group(1)):
                said, played = sollus(lhs), strokes(rhs)
                if said and played:
                    pairs[" ".join(said)][" ".join(played)] += 1
    return sorted(pairs.items(), key=lambda kv: -sum(kv[1].values()))


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "../karya"
    rows = int(os.environ.get("ROWS", 40))
    print("| Solkattu | Times | Realizations, most common first |")
    print("|---|---|---|")
    for phrase, counts in tally(root)[:rows]:
        found = ", ".join(f"`{r}` ×{n}" for r, n in counts.most_common(4))
        print(f"| {phrase} | {sum(counts.values())} | {found} |")


if __name__ == "__main__":
    main()
