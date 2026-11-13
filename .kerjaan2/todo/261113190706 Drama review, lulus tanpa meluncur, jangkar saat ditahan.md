---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: [261113190702]
related: [261113190705]
touches: [viewer/web/space/director.js, viewer/web/space/world.js, viewer/web/space/cast.js, viewer/web/space/actor.js, viewer/web/space/plan.js, viewer/web/space/demo.js, tests/viewer.test.mjs, docs/galangan-padanan.md]
created: 2026-11-13 19:07
---

## Background

Di galangan 0.16.0 review hanya terlihat sebagai Inspector yang berkeliling
lalu memberi "✓" atau "✗", dan kapal yang lulus tetapi ditahan atau dihentikan
tampil sama dengan yang menunggu giliran merge. Pemilik memutuskan (keputusan
29 dan 30 di `docs/galangan-tahap2.md`): review diberi drama, lulus belum
berarti meluncur, dan kapal yang ditahan menunggu dengan jangkar turun. Tiket
ini dibangun di atas pemutar linimasa.

## Request

Review menjadi adegan: tukang yang menyerahkan pekerjaannya meloncat senang,
Inspector datang dan mengelilingi kapal, lalu lulus (bicara singkat, tukang
senang, layar dipasang) atau ditolak (❌, tukang sedih dan kembali bekerja).
Kapal yang lulus tetap di doknya dan baru meluncur saat tiketnya mendarat di
main; selama ditahan atau dihentikan, jangkarnya turun.

## Done when

- [ ] Saat tiket diserahkan untuk review, tukangnya meloncat senang dengan balon 🥳.
- [ ] Saat reviewer bekerja, Inspector datang ke kapal itu dan mengelilinginya.
- [ ] Lulus: Inspector mendekati tukang dan bicara singkat, tukang senang, layar dipasang; kapal tetap di doknya.
- [ ] Ditolak: Inspector memberi ❌, tukang sedih lalu kembali bekerja.
- [ ] Kapal hanya meluncur dan berlabuh saat tiketnya mendarat (`landed`), tidak saat lulus.
- [ ] Kapal lulus yang ditahan atau dihentikan menunggu dengan jangkar turun; jangkar naik lagi begitu dilepas.
- [ ] Mode `?demo` memperlihatkan satu tiket lulus, satu ditolak lalu lulus, dan satu ditahan. `docs/galangan-padanan.md` diperbarui.
- [ ] (owner) Senang, sedih, dan ❌ terbaca jelas dari jarak kamera biasa.

## Out of scope

Peran derek putar dan kapal tunda dalam peluncuran, serta main yang dibawa
masuk sebelum merge (belum diputuskan pemilik).

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Tiket lane light lulus saat diserahkan, tanpa reviewer; begitu juga tiket yang diterima pemilik ('k2 accept') sesudah ditolak. Adegannya: (a) tukang meloncat senang dan layar langsung dipasang, tanpa Inspector; (b) Inspector tetap datang berkeliling dan meluluskan, walau tidak ada reviewer. Saran: (a), galangan tidak memperlihatkan yang tidak terjadi.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): lulus tanpa reviewer (lane light, atau 'k2 accept'): tukang meloncat senang dan layar langsung dipasang, tanpa Inspector. (owner, 2026-11-13)
- Q2 [answered] Sesudah lulus, main kadang harus dibawa masuk dulu dan worker dipanggil lagi (di luar cakupan tiket ini). Selama itu kapalnya: (a) layar tetap terpasang, tukang bekerja di kapal seperti biasa, tanpa adegan khusus; (b) layar dilepas lagi sampai lulus ulang. Saran: (a).
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): selama main dibawa masuk sesudah lulus, layar tetap terpasang dan tukang bekerja seperti biasa, tanpa adegan khusus. (owner, 2026-11-13)
- Q3 [answered] Peluncuran saat 'landed' tetap seperti 0.16.0 (Crane operator datang, kapal meluncur di landasan, berlabuh; empat kapal terbaru tinggal)? (a) ya, tidak diubah; (b) kapal meluncur sendiri tanpa Crane operator sampai peran derek diputuskan. Saran: (a).
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): peluncuran saat 'landed' tetap seperti 0.16.0, tidak diubah. (owner, 2026-11-13)
- Q4 [answered] Beberapa kapal menunggu review atau vonis sekaligus dan Inspector hanya satu: (a) ia mendatangi satu per satu menurut urutan kejadian, adegan tiket lain menunggu gilirannya (dan dipercepat bila tertinggal); (b) bila ia sudah ditunggu tiga pekerjaan, vonis ditampilkan tanpa ia datang, seperti aturan 0.16.0. Saran: (a): drama review adalah inti tiket ini.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): Inspector mendatangi kapal satu per satu menurut urutan kejadian; adegan tiket lain menunggu gilirannya. (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Jangkar mengikuti keadaan papan (state held atau stopped), bukan hanya kejadian 'held': papan tidak menulis kejadian saat penahanan dilepas.
  Why: core hanya menulis kejadian 'held'; pelepasan hanya mengubah state, dan tiket pemutar tetap membaca yang tidak ada di linimasa dari keadaan.
  If wrong: Tambah kejadian pelepasan di core lewat tiket tersendiri.

## Decisions
- Lane standard: adegan baru di banyak berkas galangan. Menunggu 261113190702.
