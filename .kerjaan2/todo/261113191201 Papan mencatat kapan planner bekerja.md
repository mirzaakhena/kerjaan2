---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: [261113190704]
touches: [core/cmd-hook.mjs, hooks/hooks.json, core/board.mjs, viewer/snapshot.mjs, tests/k2.test.mjs, tests/viewer.test.mjs]
created: 2026-11-13 19:12
---

## Background

Worker dan reviewer dicatat papan pada saat mereka dikirim (hook `agent-sent`
di `core/cmd-hook.mjs`), sehingga viewer tahu siapa yang sedang bekerja.
Planner dikenali hook yang sama tetapi tidak dicatat, dan ia tidak terikat
pada satu tiket: ia membaca seluruh backlog. Akibatnya viewer tidak bisa
memperlihatkan bahwa planner sedang bekerja, hanya hasilnya. Planner bekerja
dua kali: sekali untuk usulan, lalu dilanjutkan (dikirimi pesan) setelah
pemilik menjawab.

Tiket ini dipecah dari "Perencana terlihat bekerja dan meja todo"
(261113190704): di sini hanya catatannya di papan dan jalan viewer untuk
membacanya; adegan di galangan ada di tiket itu. Bagian dari galangan tahap 2
(keputusan 26 di `docs/galangan-tahap2.md`).

Yang perlu diingat: plugin yang berjalan di sesi adalah salinan terpasang,
bukan sumber di repo ini. Hook yang diubah di sini baru berjalan di sesi
sungguhan setelah `/plugin update kerjaan2` dan sesi baru.

## Request

Papan mencatat saat planner dikirim, saat ia dilanjutkan, dan saat ia selesai,
tanpa terikat pada satu tiket, dan viewer memperlihatkan bahwa planner sedang
bekerja.

## Done when

- [ ] Saat planner dikirim, papan mencatat bahwa planner sedang bekerja dan sejak kapan, tanpa menyebut satu tiket; mandor tidak perlu menjalankan perintah apa pun untuk itu.
- [ ] Saat planner itu berhenti, catatannya berakhir; saat ia dilanjutkan dengan pesan, catatannya hidup lagi.
- [ ] Keadaan papan yang dibaca halaman viewer menyebut apakah planner sedang bekerja dan sejak kapan, dan Control room memperlihatkannya sebagai kartu "planner" dengan langkah terakhirnya dari transkrip.
- [ ] Planner yang tidak pernah tercatat selesai (misalnya sesi ditutup di tengah jalan) tidak tampil bekerja selamanya: sesudah `stuck_after_minutes` ia tidak lagi dianggap bekerja.
- [ ] Mengirim worker atau reviewer tercatat seperti sebelumnya, dan mengirim agen lain yang bukan milik kerjaan2 tidak mencatat apa pun.
- [ ] Hook tidak pernah menggagalkan sesi: papan yang tidak ada, tidak terbaca, atau sedang terkunci dilewati dengan diam.
- [ ] Viewer tetap hanya membaca: catatan ini ditulis oleh hook, bukan oleh viewer.
- [ ] (owner) Di sesi kerjaan2 sungguhan, sesudah `/plugin update kerjaan2` dan sesi baru, planner yang dikirim tampil sedang bekerja di viewer dan hilang begitu ia selesai.

## Out of scope

Adegan di galangan (si perencana, meja todo): tiket 261113190704. Mencatat
kegiatan mandor (sesi utama).

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Di mana pemilik bisa melihat planner bekerja sebelum adegan galangannya ada? (a) Control room di viewer mendapat kartu 'planner' (sejak kapan, dan langkah terakhirnya dari transkrip seperti worker dan reviewer); (b) hanya ada di data keadaan untuk galangan, belum tampil di mana pun. Saran: (a), supaya tiket ini bisa dicoba sendiri; bila (b), baris (owner) di tiket ini dipindah ke tiket 261113190704.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): Control room di viewer mendapat kartu 'planner' (sejak kapan, dan langkah terakhirnya dari transkrip seperti worker dan reviewer). (owner, 2026-11-13)
- Q2 [answered] Catatan planner disimpan di mana? (a) di keadaan lokal papan (seperti catatan worker dan reviewer; tidak ikut commit, tidak masuk linimasa tiket); (b) juga sebagai log tingkat papan yang ikut di-commit, supaya riwayat planning bisa dibaca kemudian. Saran: (a): cukup untuk galangan dan tidak menambah berkas yang berubah di tiap sesi.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): catatan planner disimpan di keadaan lokal papan, seperti catatan worker dan reviewer; tidak ikut commit, tidak masuk linimasa tiket. (owner, 2026-11-13)
- Q3 [answered] Dua planner tercatat sekaligus (mandor mengirim planner baru selagi yang lama belum tercatat selesai): (a) yang terbaru menggantikan yang lama, viewer hanya memperlihatkan satu planner; (b) semuanya dicatat. Saran: (a): papan hanya punya satu perencana.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): planner terbaru menggantikan yang lama; viewer hanya memperlihatkan satu planner. (owner, 2026-11-13)

## Decisions
- Lane standard: mengubah hook dan inti (catatan baru di papan), dengan uji; tidak menyangkut izin atau data yang tak bisa dipulihkan. Tidak menunggu apa pun: tidak menyentuh galangan.
