# Model cost log

GPT-5.4 mini list price: $0.75 / 1M input, $4.50 / 1M output (https://developers.openai.com/api/docs/models/gpt-5.4-mini). Cost is computed from stored ModelUsage tokens; cached-input discounts are not applied, so it is an upper bound.

- 2026-10-29 gpt-5.4-mini hkust: 1 calls, 2939 in / 1113 out tokens, **$0.0072** ($0.0072/call), 1 pages, 0 gated, 1 candidates (1 flagged), 50 errors, 299s. Job cmvt8n67o0000ytv1ec2ozfcs.
- 2026-10-29 gpt-5.4-mini hkust, second run (20 pages, browser rendering on for join.hkust.edu.hk): stopped manually after stalling in `page.goto` on rendered pages; 1 call, 2898 in / 490 out tokens, about $0.0044. No candidates reviewed.
- Total gpt-5.4-mini spend today, both runs: 2 calls, 5837 in / 1603 out tokens, **$0.0116**, about $0.006 per call. Extrapolation: 100 extraction calls cost about $0.6. Nothing was published.

- 2026-10-29 gpt-5.4-mini hkust: 15 calls, 43575 in / 5326 out tokens, **$0.0566** ($0.0038/call), 19 pages, 1 gated, 0 candidates (0 flagged), 0 errors, 61s. Job cmvt9t2zt0000g9v1t70akp3o.

- 2026-10-29 gpt-5.4-mini hkust: 20 calls, 56682 in / 6918 out tokens, **$0.0736** ($0.0037/call), 21 pages, 0 gated, 1 candidates (1 flagged), 0 errors, 103s. Job cmvt9vkmv0000iiv1nkr70lh4.

- 2026-10-29 gpt-5.4-mini hkust: 5 calls, 18644 in / 4144 out tokens, **$0.0326** ($0.0065/call), 20 pages, 15 gated, 3 candidates (3 flagged), 0 errors, 159s. Job cmvt9z7c60000tcv1o9puq2bb.

- 2026-10-29 gpt-5.4-mini hkust: 7 calls, 22574 in / 4157 out tokens, **$0.0356** ($0.0051/call), 46 pages, 39 gated, 4 candidates (4 flagged), 0 errors, 151s. Job cmvta3mgb0000i5v1f0j45xz5.
- Final run after the extractor fix (header-in-main, NBSP, hard-fact gate): 7 calls from 46 pages (39 gated), 4 candidates, 0 crawl errors, $0.0356. Before the fixes: 15 calls produced 0 candidates and 50 pages failed. Remaining quality problems: 3 excerpts still fail verbatim validation, and two candidate "programs" are admission categories ("中国内地高考入学") or a department ("Department of Computer Science"), not degrees. Nothing is approved or published.

- 2026-10-29 gpt-5.4-mini hkust: 5 calls, 41100 in / 5451 out tokens, **$0.0554** ($0.0111/call), 3 pages, 0 gated, 5 candidates (5 flagged), 0 errors, 122s. Job cmvtb3ozv000075v1yyp4magx.

- 2026-10-29 gpt-5.4-mini hkust: 5 calls, 41745 in / 6206 out tokens, **$0.0592** ($0.0118/call), 0 pages, 0 gated, 4 candidates (4 flagged), 0 errors, 125s. Job cmvtb8pie0000dav1u3dfzlmb.

- 2026-10-29 gpt-5.4-mini polyu: 2 calls, 17403 in / 2251 out tokens, **$0.0232** ($0.0116/call), 32 pages, 0 gated, 2 candidates (2 flagged), 7 errors, 151s. Job cmvtbhfl000001cv1lqfh22b9.

- 2026-10-29 gpt-5.4-mini hku: 1 calls, 8573 in / 1130 out tokens, **$0.0115** ($0.0115/call), 20 pages, 0 gated, 1 candidates (1 flagged), 0 errors, 85s. Job cmvtbla9i00008yv1xyqarafn.

- 2026-10-29 gpt-5.4-mini hkust: 5 calls, 41745 in / 6548 out tokens, **$0.0608** ($0.0122/call), 0 pages, 0 gated, 5 candidates (5 flagged), 0 errors, 127s. Job cmvtbnd3m0000cfv1xrcrjbwk.

- 2026-10-29 gpt-5.4-mini polyu: 2 calls, 17403 in / 2156 out tokens, **$0.0228** ($0.0114/call), 25 pages, 0 gated, 2 candidates (2 flagged), 7 errors, 143s. Job cmvtbq4g00000fuv1lh44pn0c.

- 2026-10-29 gpt-5.4-mini hku: 1 calls, 8389 in / 1215 out tokens, **$0.0118** ($0.0118/call), 20 pages, 0 gated, 1 candidates (1 flagged), 1 errors, 117s. Job cmvtbu0c50000kiv1i6a4a52a.

- 2026-10-29 gpt-5.4-mini polyu: 2 calls, 18564 in / 2982 out tokens, **$0.0273** ($0.0137/call), 20 pages, 0 gated, 2 candidates (2 flagged), 7 errors, 130s. Job cmvtbwkcx0000khv1dd5qgo5s.

- 2026-10-29 hku: 0 calls, 0 in / 0 out tokens, **$0** ($0/call), 19 pages, 0 gated, 0 candidates (0 flagged), 0 errors, 69s. Job cmvtc3ye80000dwv17nh40slp.

- 2026-10-29 gpt-5.4-mini hkust: 5 calls, 44107 in / 6685 out tokens, **$0.0632** ($0.0126/call), 0 pages, 0 gated, 5 candidates (5 flagged), 0 errors, 124s. Job cmvtc5huv0000lfv1n3akm7vn.

- 2026-10-29 polyu: 0 calls, 0 in / 0 out tokens, **$0** ($0/call), 19 pages, 0 gated, 0 candidates (0 flagged), 7 errors, 132s. Job cmvtc86y60000mrv1269hxdys.

- 2026-10-29 gpt-5.4-mini hkust: 5 calls, 53224 in / 7441 out tokens, **$0.0734** ($0.0147/call), 0 pages, 0 gated, 5 candidates (5 flagged), 0 errors, 108s. Job cmvtcc1430000osv1s1z89mdv.
- 2026-10-29 program-targeted pipeline (registry: HKUST 5, HKU 1, PolyU 2 programs): one call per program over up to seven cited pages, about $0.011-0.015 per program. Final HKUST run: 5 calls, 53224 in / 7441 out tokens, **$0.0734**, 5 candidates with non-local tuition (HKD 260,000), 2026-2027 application dates and scholarships. HKU run: 1 call, $0.0118, non-local STEM tuition HKD 280,000 plus SAT/AP rules. PolyU run: 2 calls, $0.0273, non-local tuition HKD 240,000, 17 Nov 2026 deadline, application fee, scholarships. Cumulative gpt-5.4-mini spend today is about $0.6.

- 2026-10-29 gpt-5.4-mini hkust: 4 calls, 42874 in / 6051 out tokens, **$0.0594** ($0.0148/call), 0 pages, 0 gated, 4 candidates (4 flagged), 0 errors, 66s. Job cmvtt767l0000o5v1lhnshrhp.

- 2026-10-29 gpt-5.4-mini hku: 1 calls, 10031 in / 2726 out tokens, **$0.0198** ($0.0198/call), 7 pages, 0 gated, 1 candidates (1 flagged), 0 errors, 45s. Job cmvtt8md30000yfv1ytw24h3s.

- 2026-10-29 gpt-5.4-mini polyu: 1 calls, 11869 in / 1846 out tokens, **$0.0172** ($0.0172/call), 10 pages, 0 gated, 1 candidates (1 flagged), 0 errors, 44s. Job cmvtt9m7h0000uyv1imwflgt6.

- 2026-10-29 gpt-5.4-mini hkust: 4 calls, 42874 in / 7308 out tokens, **$0.065** ($0.0163/call), 0 pages, 0 gated, 3 candidates (3 flagged), 0 errors, 79s. Job cmvttdo58000062v1b4db7hw0.

- 2026-10-29 gpt-5.4-mini hku: 1 calls, 10031 in / 2783 out tokens, **$0.02** ($0.02/call), 7 pages, 0 gated, 1 candidates (1 flagged), 0 errors, 47s. Job cmvttfend0000z1v19g1d2k16.

- 2026-10-29 gpt-5.4-mini polyu: 1 calls, 11869 in / 1594 out tokens, **$0.0161** ($0.0161/call), 10 pages, 0 gated, 1 candidates (1 flagged), 0 errors, 41s. Job cmvttggq400003nv1tbs75jta.

- 2026-10-29 gpt-5.4-mini hkust: 4 calls, 75518 in / 7676 out tokens, **$0.0912** ($0.0228/call), 8 pages, 0 gated, 4 candidates (4 flagged), 0 errors, 104s. Job cmvtulavd00009rv1nvjocclb.

- 2026-10-29 gpt-5.4-mini hkust: 4 calls, 72605 in / 5910 out tokens, **$0.081** ($0.0203/call), 6 pages, 0 gated, 4 candidates (4 flagged), 0 errors, 119s. Job cmvtupxtu00006zv1njcs7pds.

- 2026-10-29 gpt-5.4-mini hkust: 4 calls, 70999 in / 7802 out tokens, **$0.0884** ($0.0221/call), 0 pages, 0 gated, 4 candidates (4 flagged), 0 errors, 98s. Job cmvtut7mz0000u8v1bwzu1hbl.

- 2026-10-29 gpt-5.4-mini hkust: 4 calls, 77522 in / 11007 out tokens, **$0.1077** ($0.0269/call), 0 pages, 0 gated, 4 candidates (4 flagged), 0 errors, 117s. Job cmvtuy0vq00008vv1kmd9wwcf.

- 2026-10-31 gpt-4.1-mini hku: 2 calls, 32232 in / 3672 out tokens, **$0.0407** ($0.0203/call), 0 pages, 0 gated, 2 candidates (2 flagged), 0 errors, 61s. Job cmvwkeh3e0000qxv10dkfzn6n.

- 2026-10-31 gpt-4.1-mini hku: 2 calls, 37087 in / 3994 out tokens, **$0.0458** ($0.0229/call), 0 pages, 0 gated, 2 candidates (2 flagged), 0 errors, 36s. Job cmvwkhmbw0000qcv13mhwtsfh.

- 2026-10-31 gpt-4.1-mini cuhk: 4 calls, 37632 in / 6625 out tokens, **$0.058** ($0.0145/call), 8 pages, 0 gated, 4 candidates (4 flagged), 0 errors, 67s. Job cmvwkndfy00009ov15bfihlmf.

- 2026-10-31 gpt-4.1-mini cuhk: 4 calls, 37632 in / 5166 out tokens, **$0.0515** ($0.0129/call), 0 pages, 0 gated, 4 candidates (4 flagged), 0 errors, 59s. Job cmvwkqjpv0000dpv1fjdlkp91.

- 2026-10-31 gpt-4.1-mini hkust: 4 calls, 78390 in / 10450 out tokens, **$0.1058** ($0.0265/call), 1 pages, 0 gated, 4 candidates (4 flagged), 0 errors, 140s. Job cmvwkuh9f00009dv1zi75bxow.

- 2026-10-31 gpt-4.1-mini polyu: 1 calls, 18494 in / 1306 out tokens, **$0.0197** ($0.0197/call), 1 pages, 0 gated, 1 candidates (1 flagged), 0 errors, 31s. Job cmvwkxiox00001hv1e1mzkrfp.

- 2026-10-31 gpt-4.1-mini hku: 2 calls, 37087 in / 4565 out tokens, **$0.0484** ($0.0242/call), 0 pages, 0 gated, 2 candidates (2 flagged), 0 errors, 67s. Job cmvwky88b0000l2v1p2msq2cv.

- 2026-10-31 gpt-4.1-mini cuhk: 4 calls, 37632 in / 6613 out tokens, **$0.058** ($0.0145/call), 0 pages, 0 gated, 4 candidates (4 flagged), 0 errors, 84s. Job cmvwkzp8300005bv1w0qucgvp.

- 2026-10-31 gpt-4.1-mini hkbu: 1 calls, 11344 in / 2736 out tokens, **$0.0208** ($0.0208/call), 3 pages, 0 gated, 1 candidates (1 flagged), 0 errors, 27s. Job cmvwl1op60000g4v10ok0zag0.

- 2026-10-31 gpt-5.4-mini hkbu: 1 calls, 11341 in / 2781 out tokens, **$0.021** ($0.021/call), 0 pages, 0 gated, 1 candidates (1 flagged), 0 errors, 21s. Job cmvwl9qca0000f4v1ensade7b.

- 2026-10-31 gpt-5.4-mini polyu: 1 calls, 18491 in / 1054 out tokens, **$0.0186** ($0.0186/call), 0 pages, 0 gated, 1 candidates (1 flagged), 0 errors, 24s. Job cmvwla7wj0000trv1vutr9sus.

- 2026-10-31 gpt-5.4-mini hkust: 4 calls, 78378 in / 11662 out tokens, **$0.1113** ($0.0278/call), 0 pages, 0 gated, 4 candidates (4 flagged), 0 errors, 94s. Job cmvwlbdzf0000xev1squw6xsb.

- 2026-10-31 gpt-5.4-mini hku: 2 calls, 37081 in / 4961 out tokens, **$0.0501** ($0.0251/call), 0 pages, 0 gated, 2 candidates (2 flagged), 0 errors, 43s. Job cmvwldfye0000iev1ags14zp9.

- 2026-10-31 gpt-5.4-mini cuhk: 4 calls, 37620 in / 11560 out tokens, **$0.0802** ($0.0201/call), 0 pages, 0 gated, 4 candidates (4 flagged), 0 errors, 72s. Job cmvwleevt00009rv1nplxlurc.

- 2026-10-31 gpt-5.4-mini polyu: 1 calls, 21697 in / 2583 out tokens, **$0.0279** ($0.0279/call), 5 pages, 0 gated, 1 candidates (1 flagged), 0 errors, 40s. Job cmvwm552700009bv176l1pzoe.

- 2026-10-31 gpt-5.4-mini hku: 2 calls, 37275 in / 5491 out tokens, **$0.0527** ($0.0263/call), 1 pages, 0 gated, 2 candidates (2 flagged), 0 errors, 38s. Job cmvwm61qp0000ybv1h3q4y8xu.

- 2026-10-31 gpt-5.4-mini cuhk: 4 calls, 48772 in / 12307 out tokens, **$0.092** ($0.023/call), 1 pages, 0 gated, 4 candidates (4 flagged), 0 errors, 81s. Job cmvwm6wtz0000pgv11h2dasoc.

- 2026-10-31 gpt-5.4-mini hkbu: 1 calls, 11341 in / 2804 out tokens, **$0.0211** ($0.0211/call), 0 pages, 0 gated, 1 candidates (1 flagged), 0 errors, 24s. Job cmvwm8oor0000z5v1gf8e6jev.

- 2026-10-31 gpt-5.4-mini hkust: 4 calls, 78378 in / 11824 out tokens, **$0.112** ($0.028/call), 0 pages, 0 gated, 4 candidates (4 flagged), 0 errors, 99s. Job cmvwm98jo0000e1v162k7e4wk.
