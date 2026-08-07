"""Bundle data.json + the app into one self-contained builder/index.html.

Single file on purpose: it must work from file:// with no server, and fetch()
against file:// is blocked by CORS in Chrome. Inlining sidesteps that and makes
the page trivially portable.

Run:  python3 sim/extract_builder_data.py && python3 builder/build_page.py
"""

from __future__ import annotations

import hashlib
import datetime
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data.json"
ORIGIN = HERE / "origin.json"
APP_CSS = HERE / "app.css"
APP_JS = HERE / "app.js"
ICONS_PNG = HERE / "icons.png"
ICONS_COLOR = HERE / "icons_color.png"
ICONS_JSON = HERE / "icons.json"
OUT = HERE / "index.html"

HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bannerlord Character Builder — v1.4.7</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alegreya:wght@400;500;600;700&display=swap">
<style>
__ICONS_CSS__
__CSS__
</style>
</head>
<body>
<header class="topbar">
  <div class="brand">Character Builder
    <small>Mount &amp; Blade II: Bannerlord v1.4.7 &middot; tool updated __BUILT__</small>
  </div>
  <div class="tools">
    <input id="perkSearch" class="psearch" type="search"
           placeholder="Search perks — try &#8220;party size&#8221;">
    <select id="perkBrowse" class="osel browse"></select>
    <label class="lvl">Level <input id="level" type="number" min="1" max="62" value="1"></label>
    <label class="chk"><input id="navalToggle" type="checkbox" checked> War Sails</label>
    <button id="share" class="btn primary">Copy build link</button>
    <button id="reset" class="btn">Reset build</button>
  </div>
</header>

<div id="originbar"></div>

<div class="screen">
  <aside class="skillspanel">
    <div class="panel-head">
      <div class="pts" id="attrPts" title="Unspent attribute points">
        <span class="ic">&#9670;</span><span class="num">0</span>
      </div>
      <h2>Skills</h2>
      <div class="pts" id="focusPts" title="Unspent focus points">
        <span class="ic">&#9673;</span><span class="num">0</span>
      </div>
    </div>
    <div class="rows" id="rows"></div>
  </aside>
  <section class="rightcol">
    <div class="panelbox" id="searchbox" hidden>
      <div class="panel-head sub">
        <h2 id="searchTitle">Search results</h2>
        <span class="shead-tools">
          <span class="badge" id="searchBadge">0 perks</span>
          <button id="searchTakeAll" class="btn">Take all</button>
          <button id="searchClose" class="btn xbtn" title="Clear search">&#215;</button>
        </span>
      </div>
      <div class="chosenbody" id="searchResults"></div>
    </div>
    <div class="panelbox">
      <section class="detail" id="detail"></section>
    </div>
    <div class="panelbox">
      <div class="panel-head sub">
        <h2>Chosen perks</h2>
        <span class="shead-tools">
          <span class="badge" id="chosenBadge">0 selected</span>
          <button id="chosenToggleAll" class="btn">Collapse all</button>
          <button id="chosenCollapse" class="btn xbtn" title="Collapse panel">&#9662;</button>
        </span>
      </div>
      <div class="chosenbody" id="chosen"></div>
    </div>
  </section>
</div>

<div id="originModal" class="omodal" hidden>
  <div class="omodal-card">
    <div class="panel-head sub"><h2>Origin</h2></div>
    <div class="obody" id="originFields"></div>
    <p class="odesc" id="originDesc"></p>
    <div class="ofoot">
      <span class="ochips" id="originChips"></span>
      <button id="resetOrigin" class="btn">Reset origin</button>
      <button id="originDone" class="btn primary">Done</button>
    </div>
  </div>
</div>

<div id="toast" class="toast"></div>

<script>
const DATA = __DATA__;
const ICONS = __ICONS__;
const VER = __VER__;
const ORIGIN = __ORIGIN__;
__JS__
</script>
</body>
</html>
"""


def data_version(data) -> tuple[str, dict]:
    """Short key identifying the exact orderings share links index into.

    Same idea as owtt's window.versionMaps: links encode array indices and a
    bitmap, so any reorder of perks/skills across a game patch would silently
    corrupt old links. Instead each build registers its orderings under a
    4-hex key in versions.json (append-only, committed); the page embeds the
    registry and decodes a link against the orderings of the version that
    minted it, remapping by stable StringId and dropping ids that no longer
    exist.
    """
    origin = json.loads(ORIGIN.read_text()) if ORIGIN.exists() else None
    ordering = {
        "p": [x["id"] for x in data["perks"]],
        "s": [x["id"] for x in data["skills"]],
        "a": [x["id"] for x in data["attributes"]],
        # origin orderings: culture list + per-stage option ids, so v3 links
        # survive reorders exactly like perks do
        "c": origin["cultures"] if origin else [],
        "g": [[o["id"] for o in st["options"]] for st in origin["stages"]] if origin else [],
    }
    dv = hashlib.sha1(json.dumps(ordering, separators=(",", ":"))
                      .encode()).hexdigest()[:4]
    reg_path = HERE / "versions.json"
    reg = json.loads(reg_path.read_text()) if reg_path.exists() else         {"v1": dv, "entries": {}}
    if dv not in reg["entries"]:
        reg["entries"][dv] = ordering
        reg_path.write_text(json.dumps(reg, separators=(",", ":")))
        print(f"  registered data version {dv} "
              f"({len(reg['entries'])} known)")
    return dv, reg


def main() -> None:
    data = json.loads(DATA.read_text())
    dv, reg = data_version(data)
    # xpRequiredForSkillLevel is not used by the page; drop it to halve the size.
    data.pop("xpRequiredForSkillLevel", None)
    # inline the icon mask sheet so the page stays a single portable file
    icons_css, icons_js = "", "null"
    if ICONS_PNG.exists() and ICONS_JSON.exists():
        import base64
        b64 = base64.b64encode(ICONS_PNG.read_bytes()).decode()
        icons_css = f":root{{--icons:url(data:image/png;base64,{b64})"
        if ICONS_COLOR.exists():
            c64 = base64.b64encode(ICONS_COLOR.read_bytes()).decode()
            icons_css += f";--iconsc:url(data:image/png;base64,{c64})"
        icons_css += "}"
        icons_js = ICONS_JSON.read_text()
        print(f"  icons: {ICONS_PNG.stat().st_size/1024:.0f} KB -> "
              f"{len(b64)/1024:.0f} KB base64")

    origin_js = ORIGIN.read_text() if ORIGIN.exists() else "null"
    html = (HTML
            .replace("__BUILT__", datetime.date.today().isoformat())
            .replace("__ORIGIN__", origin_js)
            .replace("__VER__", json.dumps(
                {"cur": dv, "v1": reg["v1"], "entries": reg["entries"]},
                separators=(",", ":")))
            .replace("__ICONS_CSS__", icons_css)
            .replace("__ICONS__", icons_js)
            .replace("__CSS__", APP_CSS.read_text())
            .replace("__JS__", APP_JS.read_text())
            .replace("__DATA__", json.dumps(data, separators=(",", ":"))))
    OUT.write_text(html)
    print(f"wrote {OUT}  ({OUT.stat().st_size/1024:.0f} KB)")
    print(f"  {len(data['perks'])} perks, {len(data['skills'])} skills, "
          f"{len(data['attributes'])} attributes")
    print(f"open: file://{OUT}")


if __name__ == "__main__":
    main()
