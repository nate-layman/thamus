#!/usr/bin/env python3
"""Fetch 2 CFR 200 from the eCFR and cut it into passages for the vector index.

Writes docs/index/chunks.json. Run embed_corpus.mjs afterwards to add the
vectors. Standard library only.

A passage is one top-level paragraph of a section ((a), (b), ...), with its
sub-paragraphs folded in while it stays short, or one definition from 200.1,
or a run of paragraphs from an appendix. Each carries the pinpoint citation
an auditor would want, so the page can show where a retrieved passage came
from and link to it on ecfr.gov.
"""
import gzip
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from pathlib import Path

TITLE = 2
PART = "200"
TARGET = 1000   # characters a passage aims for
HARD_MAX = 1500 # a passage is split before it passes this
OUT = Path(__file__).resolve().parent.parent / "docs" / "index" / "chunks.json"


def get(url):
    req = urllib.request.Request(url, headers={"Accept-Encoding": "gzip", "User-Agent": "thamus-index-builder"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            data = gzip.decompress(data)
        return data


def latest_date():
    titles = json.loads(get("https://www.ecfr.gov/api/versioner/v1/titles.json"))["titles"]
    t = next(x for x in titles if x["number"] == TITLE)
    return t["up_to_date_as_of"], t["latest_amended_on"]


def text_of(el):
    return re.sub(r"\s+", " ", "".join(el.itertext())).strip()


TOP = re.compile(r"^\(([a-z])\)\s")
L2 = re.compile(r"^\((\d+)\)\s")
L3 = re.compile(r"^\(([ivx]+)\)\s")


def level(txt):
    if TOP.match(txt):
        return 1, TOP.match(txt).group(1)
    if L2.match(txt):
        return 2, L2.match(txt).group(1)
    if L3.match(txt):
        return 3, L3.match(txt).group(1)
    return 0, None


def section_url(section, anchor=None):
    base = f"https://www.ecfr.gov/current/title-{TITLE}/part-{PART}/section-{section}"
    return base + (f"#p-{anchor}" if anchor else "")


class Builder:
    def __init__(self):
        self.chunks = []

    def add(self, **c):
        c["text"] = c["text"].strip()
        if not c["text"]:
            return
        c["id"] = len(self.chunks)
        self.chunks.append(c)

    def pack(self, paras, make):
        """Join paragraphs into passages of about TARGET characters; paras is a list of
        (label, text). make(labels) returns the pinpoint fields for a passage."""
        buf, labels = [], []
        size = 0
        for label, txt in paras:
            if buf and size + len(txt) > (HARD_MAX if size < TARGET else TARGET):
                self.add(text="\n".join(buf), **make(labels))
                buf, labels, size = [], [], 0
            buf.append(txt)
            labels.append(label)
            size += len(txt) + 1
        if buf:
            self.add(text="\n".join(buf), **make(labels))


def definitions(b, sec, heading, subpart):
    """200.1: one passage per defined term (long ones split)."""
    paras = sec.findall("P")
    intro = text_of(paras[0]) if paras else ""
    b.add(cite=f"2 CFR {PART}.1", pin=f"2 CFR {PART}.1", heading=heading, sub="Introduction",
          subpart=subpart, text=intro, url=section_url("200.1"))
    term, body = None, []

    def flush():
        if term is None:
            return
        anchor = "200.1(" + term + ")"
        b.pack([(None, t) for t in body], lambda labels: dict(
            cite=f"2 CFR {PART}.1", pin=f'2 CFR {PART}.1, "{term}"', heading=heading, sub=term,
            subpart=subpart, url=section_url("200.1", anchor)))

    for p in paras[1:]:
        first = list(p)[0] if len(p) else None
        txt = text_of(p)
        starts_term = first is not None and first.tag == "I" and (p.text or "").strip() == "" and len(first.text or "") < 80
        if starts_term:
            flush()
            term = re.sub(r"\s+", " ", first.text).strip().rstrip(".")
            body = [txt]
        elif term is not None:
            body.append(txt)
    flush()


def section(b, sec, subpart):
    num = sec.get("N")
    heading = text_of(sec.find("HEAD"))
    if num == "200.1":
        return definitions(b, sec, heading, subpart)
    paras = [(p.tag, text_of(p)) for p in sec if p.tag in ("P", "FP", "HD1", "HD2", "HD3", "TABLE", "EXTRACT", "NOTE")]
    paras = [(t, x) for t, x in paras if x]
    groups = []  # [(top_label or None, [(sub_label, text), ...])]
    for tag, txt in paras:
        lv, lab = level(txt)
        if lv == 1 or not groups:
            groups.append((lab if lv == 1 else None, []))
        sub = lab if lv in (2, 3) else None
        groups[-1][1].append(((groups[-1][0], lab if lv == 2 else None), txt) if lv == 2 else ((groups[-1][0], None), txt))
    cite = f"2 CFR {num}"
    for top, items in groups:
        def make(labels, top=top):
            # labels are (top, level2) pairs; a passage spanning several level-2 items names the first
            l2 = next((x[1] for x in labels if x[1]), None)
            if top and l2 and all(x[1] for x in labels) and len({x[1] for x in labels}) == 1:
                pin, anchor = f"{cite}({top})({l2})", f"{num}({top})({l2})"
            elif top and l2 and labels[0][1]:
                last = [x[1] for x in labels if x[1]][-1]
                pin, anchor = f"{cite}({top})({l2}) to ({last})", f"{num}({top})({l2})"
            elif top:
                pin, anchor = f"{cite}({top})", f"{num}({top})"
            else:
                pin, anchor = cite, None
            return dict(cite=cite, pin=pin, heading=heading, sub=f"({top})" if top else "", subpart=subpart,
                        url=section_url(num, anchor))
        b.pack(items, make)


def appendix(b, app):
    name = app.get("N")  # "Appendix III to Part 200"
    heading = text_of(app.find("HEAD"))
    short = re.sub(r" to Part \d+$", "", name)
    cite = f"2 CFR {PART}, {short}"
    slug = re.sub(r"\s+", "-", name)
    url = f"https://www.ecfr.gov/current/title-{TITLE}/part-{PART}/{slug}"
    current_hd = ""
    runs = []  # [(hd, [texts])]
    for el in app:
        if el.tag in ("HD1", "HD2", "HD3"):
            current_hd = text_of(el)
            runs.append((current_hd, []))
            continue
        if el.tag not in ("P", "FP", "TABLE", "EXTRACT", "NOTE"):
            continue
        txt = text_of(el)
        if not txt:
            continue
        if not runs:
            runs.append(("", []))
        runs[-1][1].append(txt)
    for hd, texts in runs:
        if not texts:
            continue
        b.pack([(None, t) for t in texts], lambda labels, hd=hd: dict(
            cite=cite, pin=cite + (f", {hd}" if hd else ""), heading=heading, sub=hd, subpart=short, url=url))


def main():
    as_of, amended = latest_date()
    print(f"eCFR title {TITLE} is current to {as_of} (last amended {amended})", file=sys.stderr)
    xml = get(f"https://www.ecfr.gov/api/versioner/v1/full/{as_of}/title-{TITLE}.xml?part={PART}")
    root = ET.fromstring(xml)
    b = Builder()
    for sp in root.iter("DIV6"):
        subpart = text_of(sp.find("HEAD")).replace("—", ": ")
        for sec in sp.iter("DIV8"):
            section(b, sec, subpart)
    for app in root.iter("DIV9"):
        appendix(b, app)
    sizes = [len(c["text"]) for c in b.chunks]
    print(f"{len(b.chunks)} passages, {sum(sizes):,} characters, longest {max(sizes)}, median {sorted(sizes)[len(sizes)//2]}", file=sys.stderr)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": f"{TITLE} CFR part {PART}, eCFR, current as of {as_of}",
        "source_date": as_of,
        "last_amended": amended,
        "fetched": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "chunks": b.chunks,
    }, ensure_ascii=False, separators=(",", ":")))
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)", file=sys.stderr)


if __name__ == "__main__":
    main()
