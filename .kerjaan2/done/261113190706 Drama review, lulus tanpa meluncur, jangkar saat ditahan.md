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

- [x] Saat tiket diserahkan untuk review, tukangnya meloncat senang dengan balon 🥳.
- [x] Saat reviewer bekerja, Inspector datang ke kapal itu dan mengelilinginya.
- [x] Lulus: Inspector mendekati tukang dan bicara singkat, tukang senang, layar dipasang; kapal tetap di doknya.
- [x] Ditolak: Inspector memberi ❌, tukang sedih lalu kembali bekerja.
- [x] Kapal hanya meluncur dan berlabuh saat tiketnya mendarat (`landed`), tidak saat lulus.
- [x] Kapal lulus yang ditahan atau dihentikan menunggu dengan jangkar turun; jangkar naik lagi begitu dilepas.
- [x] Mode `?demo` memperlihatkan satu tiket lulus, satu ditolak lalu lulus, dan satu ditahan. `docs/galangan-padanan.md` diperbarui.
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
- A1 [confirmed] Jangkar mengikuti keadaan papan (state held atau stopped), bukan hanya kejadian 'held': papan tidak menulis kejadian saat penahanan dilepas.
  Why: core hanya menulis kejadian 'held'; pelepasan hanya mengubah state, dan tiket pemutar tetap membaca yang tidak ada di linimasa dari keadaan.
  If wrong: Tambah kejadian pelepasan di core lewat tiket tersendiri.
  Confirmed by owner, 2026-11-13
- A2 [confirmed] Kapal yang dihentikan (stopped) sebelum lulus tidak berjangkar; jangkar hanya untuk kapal yang sudah lulus dan ditahan atau dihentikan.
  Why: Kriteria menyebut 'kapal lulus yang ditahan atau dihentikan'; tiket yang berhenti di tengah pengerjaan sudah punya tanda sendiri (tukang menunggu).
  If wrong: Di plan.js, hilangkan syarat lulus pada 'moored'.
  Confirmed by owner, 2026-11-13
- A3 [confirmed] Putaran keliling Inspector mengikuti keadaan papan (ada reviewer di tiket itu), bukan kejadian 'agent'; bila vonis tiba sebelum ia sempat berkeliling, ia berkeliling satu putaran dulu sebelum memberi vonis.
  Why: Reviewer bekerja selama rentang waktu, bukan sesaat; keadaan papan yang tahu kapan ia selesai.
  If wrong: Jadikan putaran itu adegan dari kejadian 'agent' reviewer di director.js.
  Confirmed by owner, 2026-11-13
- A4 [confirmed] Jangkar dan rantainya dibuat dari bentuk dasar di world.js, bukan model dari ruang pamer; balon perasaan dan ❌ digambar kira-kira tiga kali lebih besar dari balon tanda.
  Why: Tidak ada model jangkar di paket yang dipakai; ukuran dipilih dari tangkapan layar kamera seluruh galangan.
  If wrong: Ganti makeAnchor di world.js atau angka ukuran balon di actor.js.
  Confirmed by owner, 2026-11-13

## Decisions
- Lane standard: adegan baru di banyak berkas galangan. Menunggu 261113190702.
- Vonis memakai tiga pekerjaan berurutan (Shipwright ke titik temu, Inspector, lalu reaksi Shipwright) tanpa saling menunggu di dalam pekerjaan, supaya dua pemeran tidak pernah saling mengunci; di antaranya Shipwright ditahan di tempat oleh tok.meet.

## Manual checks
- M1 [waiting] (item 8) 1. Sesudah tiket ini mendarat: jalankan 'k2 view' dari akar repo ini (sumbernya, bukan salinan plugin di cache).
  2. Buka halaman galangan sebuah proyek lalu tekan tombol 'Demo' (alamat berakhiran /space?demo).
  3. Jangan gerakkan kamera (tampilan 'Whole yard').
  4. Tunggu kira-kira satu menit: Inspector mendatangi kapal di dok 2, balon 💬 lalu ✓ muncul, layar dipasang, dan Shipwright 2 meloncat dengan balon 😄.
  5. Tunggu sampai kira-kira menit ketiga: Shipwright 1 meloncat dengan balon 🥳 saat menyerahkan, lalu Inspector memberi balon ❌ dan Shipwright 1 membalas dengan balon 😢 sebelum kembali memalu.
  6. Yang harus terlihat: dari kamera seluruh galangan, ketiga balon itu (senang, sedih, ❌) bisa dibedakan tanpa memperbesar.

## Handoff
Review kini adegan. plan.js: play() mengembalikan 'handed', 'pass', 'reject', atau 'cheer' (lulus tanpa reviewer: jalur light dan accepted); submitted sesudah lulus tidak mengubah apa pun; picture() memberi 'moored'. director.js: handed/cheer/verdict memakai antrean kerja Shipwright dan Inspector; layar yang tampil adalah tok.rig (naik di adegan lulus, bukan saat kejadian diputar); tok.stay menahan lambung sampai ❌; moor() menurunkan jangkar dari keadaan papan; batas BUSY tidak berlaku lagi untuk vonis, dan job() mengurutkan menurut waktu kejadian. Jangan rusak: peluncuran hanya dari landed, dan tok.meet yang menahan Shipwright di titik temu (cast.js). Demo bergiliran: lulus, ditolak lalu lulus, ditahan.

## Review
- 2026-11-13 standard, round 1, at b1605d5: passed.
  1: uji 'a review is a scene' lulus (submitted: 'wright 1 says 🥳', 'wright 1 jump'); di salinan, membuang balon itu dari handed() membuat uji gagal.
  2: inspectorDuty asli (cast.js) dijalankan dengan pemeran tiruan: ia ke titik 0,3,7,4 dok yang direview, memeriksa di tiap titik, lalu lapped=true; tanpa kapal direview ia diam. Uji juga memperlihatkan putaran empat titik sebelum vonis bila ia belum berkeliling.
  3: uji 'a review is a scene' lulus: Shipwright ke titik temu, Inspector 💬 lalu ✓, layar baru terpasang sesudahnya, Shipwright 😄 meloncat, kapal tetap di dok 600 bingkai; membuang pemasangan layar di adegan lulus membuat uji gagal.
  4: uji yang sama: ❌ dari Inspector selagi lambung masih penuh, lalu 😢, emote-no, dan kembali memalu; mengganti ❌ dengan ✗ membuat uji gagal.
  5: uji yang sama: tidak ada 'launch' sesudah lulus, hanya sesudah landed; di salinan, membuat vonis lulus berstatus done menggagalkan keempat uji.
  6: uji 'a hull that passed and is held or stopped' lulus (turun bertahap, tetap turun 600 detik, naik dan disimpan saat dilepas); membuang penyimpanan jangkar membuat uji gagal. makeAnchor asli dijalankan dengan three.js bawaan: set(0), set(0.5), set(1) memberi posisi dan rantai yang wajar.
  7: uji 'the demo shows a review each way' lulus dan gagal bila penahanan dibuang dari demo.js; docs/galangan-padanan.md punya bagian 'Review, lulus, dan jangkar', kedua tabel diperbarui, butir 'ditahan' dicabut dari yang belum berpadanan.
  8: (owner) M1 berisi langkah dari awal (k2 view, tombol Demo, kamera Whole yard) dan apa yang harus terlihat; tidak menghalangi.
  note: hanya dinilai dengan membaca: tampilan di halaman sungguhan (ukuran balon di actor.js, rupa jangkar, waktu adegan ?demo); repo tidak punya perintah untuk menjalankan peramban, jadi klaim playwright pekerja tidak diulang. Semua modul lolos node --check.
  note: uji jangkar tidak punya tiket review yang ditahan tanpa lulus: membuang syarat passed dari 'moored' di plan.js tidak menggagalkan uji apa pun. Perilaku tetap benar karena moor() di director.js juga menuntut tok.rig.
  note: k2 test meneruskan perintah ke sh tanpa kutip: pola nama uji berspasi atau memakai | harus ditulis dengan titik dan beberapa --test-name-pattern.
- 2026-11-13 conflict resolution, at 03bb845: passed.
  Gabungan 03bb845 menjaga kedua sisi: adegan review, layar tok.rig, jangkar; meja todo, tukang menjemput (see.fetched juga di submitted dan accepted), dok menurut max_parallel. Tambahan hanya penyambung: jangkar ikut dok (at), penjaga bila dok tanpa tukang. 24 uji galangan kedua sisi lulus; jangkar asli tetap di z -1.5.
