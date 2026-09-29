#!/usr/bin/env python3
"""Round 5: cuts Bupe's three-stage cocoon sheet (intact | cracked | broken, on white) into
art/cocoon_intact, art/cocoon_cracked and art/cocoon_broken, using the same halo-free matte as cut_art.py.
Usage: python3 tools/cut_cocoon.py <attachments_dir> [preview_dir]"""
import sys, os
sys.argv = [sys.argv[0], sys.argv[1] if len(sys.argv) > 1 else '.', sys.argv[2] if len(sys.argv) > 2 else 'src_art/r5']
sys.path.insert(0, os.path.dirname(__file__))
import cut_art as C
img = C.load('5810b202')
for k, name in enumerate(['cocoon_intact', 'cocoon_cracked', 'cocoon_broken']):
    # thirds of the sheet; loose amber chips around the broken shell are dropped (the game throws its own shards)
    C.finish(C.matte(img, (k / 3, 0, (k + 1) / 3, 1), keep_frac=0.02)[0], name, 300)
