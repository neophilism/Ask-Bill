# Ask Bill — 20 playable GLB character candidates

## Character release status

Twenty **real binary glTF 2.0 GLBs** are generated via `tools/blender/roster/generate_roster.py`, with a compatible `WalkFunny` action plus seven other clips. The owner has **not** visually approved any of the exported candidates. They are an audition collection, **not** the finished production Bill. In particular, the original Option 10 illustration is still the intended default visual direction even if the current procedural mesh is not a perfect sculpt. CI passing establishes binary and animation structure—not visual likeness.

### Original ten

- **01. Ivory Court Gentleman** — preserves the option-1 illustrated face, a suited parchment body, original-style curled trim; courtly persona
- **02. Tuxedo Paper Guide** — preserves the option-2 illustrated face, a suited parchment body, original-style curled trim; formal persona
- **03. Midnight Legislative Scholar** — preserves the option-3 illustrated face, a suited parchment body, original-style curled trim; scholar persona
- **04. Golden Parchment Attendant** — preserves the option-4 illustrated face, a suited parchment body, original-style curled trim; courtly persona
- **05. Navy Tailcoat Folio** — preserves the option-5 illustrated face, a suited parchment body, original-style curled trim; courtly persona
- **06. Reference Page Butler** — preserves the option-6 illustrated face, a suited parchment body, original-style curled trim; scholar persona
- **07. Ribbon Collar Companion** — preserves the option-7 illustrated face, a suited parchment body, original-style curled trim; gentle persona
- **08. Adventurous Legislative Page** — preserves the option-8 illustrated face, a suited parchment body, original-style curled trim; energetic persona
- **09. Civic Scholar Folio** — preserves the option-9 illustrated face, a suited parchment body, original-style curled trim; scholar persona
- **10. The Classic Bill** — preserves the option-10 illustrated face, a suited parchment body, original-style curled trim; classic persona

### Differentiated ten

- **11. The Origami Pathfinder** — `origami` form, `teal` accents; Playfully adventurous; follows an idea through its consequences
- **12. The Scroll Sage** — `scroll` form, `ruby` accents; Calm and reflective; explains historical background simply
- **13. The Pocket Book Librarian** — `pocketbook` form, `aubergine` accents; Quietly enthusiastic, patient and gently humorous
- **14. The Bound Tome Professor** — `hardcover` form, `forest` accents; Methodical and scholarly; offers definitions and examples
- **15. The Accordion Investigator** — `accordion` form, `saffron` accents; Inquisitive and systematic; asks what changed and why
- **16. The Paper Trail Runner** — `origami` form, `coral` accents; Lively and plainspoken; keeps answers short and visual
- **17. The Minimal Index Card** — `indexcard` form, `slate` accents; Minimalist and efficient; clear answers without ceremony
- **18. The Docket Detective** — `docket` form, `burgundy` accents; Skeptical but fair; highlights hidden assumptions
- **19. The Digital Bill** — `tablet` form, `electric` accents; Bright, accessible and technical; shows structured breakdowns
- **20. The Civic News Page** — `newspaper` form, `denim` accents; Conversational and practical; summarizes the main impact

## Generate and verify

Use Python 3.12+, Pillow 11.3.0, no network/LLM keys. From repository root:

```sh
python tools/blender/roster/generate_roster.py --references assets/bill/characters/reference --output assets/bill/characters/dist
python -m unittest discover -s tests/character-roster -p "test_*.py" -v
python -m http.server 8000
```

Visit `http://localhost:8000/apps/web/preview/characters.html`; or run the existing `pnpm preview` server and visit `http://127.0.0.1:4100/characters` using the new separately scoped local-only route. It previews **actual GLBs**, not drawings, with in-place exported walking, source selection, cursor attentiveness, 3D orbiting and instant manual character switching. The page temporarily loads a pinned third-party model-viewer module from jsDelivr and therefore requires internet; a production release must bundle/audit the renderer, enforce CSP and verify a11y, loader, animation timing, browser/mobile budgets, and security. It contains no microphone, camera, eye tracking, account access or provider calls.

## Generation workflow and binary provenance

The GitHub Actions job is restricted to same-repository pull requests. It builds from committed source and original reference-face derivatives, runs binary/animation tests, and commits the **actual 20 `.glb` files plus SHA-256 manifest** to the same PR branch. The generated-head CI checks must pass before safe merge. Distinct poses and exact likeness need 3D visual inspection in the gallery; no file may silently become the default production character.

Original ten are derived from the user-approved ten character concept images in the prior chat. The full concept images are **not** bundled here; the repo includes compact facial-texture derivatives with filenames and source hashes below. Every full original is an original AI-generated concept supplied in the user’s conversation. 3D rear geometry is interpretive because full native 3D source did not exist.

| Option | Source concept image | Full reference SHA-256 | Cropped reference SHA-256 |
|---|---|---|---|
| 01 | `bill_the_living_parchment_character_sheet.png` | `8beeaa8bf9eb2720f9d3fd139ff1559e27fc6ef555e7b375bdd7cf1090969017` | `29cd45e3b872b8e78c9f774810df78defc71d649b76cec94cb53444f4834d0fd` |
| 02 | `bill_paper_assistant_character_sheet.png` | `405b468599c54aa18f8c0bf73bdf1f5a49e28ce0f3939a7d2652e9853ab5afea` | `2109143abfb4ff314829c7e167f56c5df0b585fcd66a33256f6af25a2fc8891e` |
| 03 | `welcoming_parchment_butler_mascot.png` | `c6e1b82bcd34ea9a162c37dc0e35012fb90b07337f943c7d36fc7cee7d950db9` | `a3d5aa245f5c3332d0c84557c2100cd28ff90f6d4aa10b9a6272834f0db0b8e4` |
| 04 | `option_4_parchment_paper_butler_turnaround.png` | `0e0cc51fa63b4a85a127193a6b3c45ccccbfada76697f11998358ef86e398b92` | `15dd8b981db1b6393f8a3ab491a700b0a8a775aecaeea01ea6633157e49ba945` |
| 05 | `bill_the_paper_butler_option_5.png` | `8ae43665a000fbdd7cb8e83f8293c2b27b29700dca8b93411a669cce430e88ab` | `c8ab55da732b69a915c7fc4e2619120e423cdcd1b9d424fddc36e4b06bd52576` |
| 06 | `option_6_charming_bill_mascot.png` | `d770f36010355a0e37c445300d654efa83ef0fe64edee3037a3449750a46bf8b` | `9989bb04af33116d862f85b6e47c694527430ddba767b91fa08ff98ca2ea7107` |
| 07 | `option_7_parchment_butler_guide.png` | `20481a53c102615492b5e87ee95819dbfda5e9a8a2a8b7b0a30b7fcfaffe175e` | `7778720b3a755a20933e60b7db252f0f7b0f57ded960286e3a2c63fcf4d1f543` |
| 08 | `option_8_bill_character_concept_sheet.png` | `8d864a5129be47221e81f3d63f90e39f6d682c8ccf33a2b5d694459ce7bfb8be` | `07ec18173894d6fbf3a7d5f87865f01c927a1d05787da208a4e8be601395de5e` |
| 09 | `option_9_charming_legal_parchment.png` | `ad95355075ddd8cda4f4a31ee2dd0f61735407d56d288ebffa09c4fe81752087` | `7e42395ea0decbe07757fa9d5c393998f23d4ec1de326c01808a879115d545d8` |
| 10 | `parchment_butler_character_concept.png` | `90c8726a42547eb3eb4408417fcef78e5e28fbd2aead7c889815ae332f310596` | `8fbfb2b9637c22be6fc2764f51e44e08d9439f3a324559e4d9acf8e454b720ea` |

## Personality and user autonomy

The 20 character records include short **suggested communication styles only**. Choosing any character is explicit, can be changed any time, and is not tied to race, ethnicity, age, gender, disability, religion, citizenship, or other personal traits. There is no survey-based assignment or user demographic profiling. Later opt-in character customization must ask directly for desired appearance and demeanor and allow freeform instructions without stereotyping. Personality is a presentation preference, **never an instruction to ignore evidence, citations, safeguards or source-version integrity**.

## Remaining work

The visual studies do not replace a production-quality Blender sculpt, 52-shape facial rig, foot locking, proper LODs, glTF conformance validation, source provenance/rights audit, audio-viseme synchronization, secure provider interfaces or production browser integration. Owner can choose candidates based on actual runtime feel and then prioritize polishing those selected.