---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: [261113190702, 261113191201]
related: [261113191201, 261113190705]
touches: [viewer/web/space/director.js, viewer/web/space/world.js, viewer/web/space/cast.js, viewer/web/space/plan.js, viewer/web/space/demo.js, tests/viewer.test.mjs, docs/galangan-padanan.md]
created: 2026-11-13 19:07
---

## Background

Di galangan 0.16.0 Draughtsman baru bergerak sesudah tiket sudah pindah ke
todo: papan tidak mencatat kapan planner sedang bekerja. Catatan itu dibuat
oleh tiket "Papan mencatat kapan planner bekerja" (261113191201), yang dipecah
dari tiket ini; di sini galangan memakainya. Tiket todo sekarang berupa
gulungan di papan QUEUE, dan tiket yang masih menunggu tiket lain tampil sama
dengan yang siap. Pemilik memutuskan (keputusan 26 di
`docs/galangan-tahap2.md`): satu karakter perencana membaca papan pesanan
selama planner bekerja, lalu memindahkan tiket ke meja todo. Tiket ini
dibangun di atas pemutar linimasa.

## Request

Galangan memperlihatkan planner bekerja: si perencana (Naval Architect,
menggantikan Draughtsman) mendatangi papan pesanan dan membaca tiket-tiket
selama planner bekerja, memakai simbol `?` bila planner bertanya, lalu
memindahkan tiket ke meja todo: meja panjang dengan tiket berjejer, yang masih
menunggu tiket lain di baris belakang.

## Done when

- [ ] Selama papan mencatat planner bekerja, si perencana berada di papan pesanan dan membaca tiket; di luar itu tidak.
- [ ] Selama ada pertanyaan planner yang menunggu pemilik, si perencana memakai simbol `?`; simbol itu hilang setelah terjawab.
- [ ] Tiket yang masuk todo dipindahkan si perencana ke meja todo dan berjejer di sana menurut urutan antrean.
- [ ] Tiket todo yang harus menunggu tiket lain diletakkan di baris belakang, dan maju ke baris depan begitu tidak lagi menunggu.
- [ ] Di daftar pemeran, si perencana bernama Naval Architect; Draughtsman tidak ada lagi.
- [ ] Mode `?demo` memperlihatkan perencana membaca, bertanya, dan memindahkan tiket. `docs/galangan-padanan.md` diperbarui.
- [ ] (owner) Perencana dan meja todo enak ditonton; baris depan dan baris belakang mudah dibedakan.

## Out of scope

Karakter baru untuk si perencana (pilihan bentuk ditunda; pakai karakter
Draughtsman yang sekarang). Bentuk akhir meja todo: pakai calon yang ada di
ruang pamer, pilihan lain ditunda.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Di antara dua giliran planner (planner sudah berhenti, pertanyaannya menunggu pemilik), si perencana di mana? (a) tetap di papan pesanan, diam dengan balon '?', sampai semua pertanyaan planner terjawab; (b) kembali ke mejanya dengan balon '?'. Saran: (a), supaya terlihat apa yang ia tunggu.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): di antara dua giliran planner si perencana tetap di papan pesanan, diam dengan balon '?', sampai semua pertanyaan planner terjawab. (owner, 2026-11-13)
- Q2 [answered] Tiket todo mana yang masuk baris belakang? (a) yang belum bisa mulai karena tiket lain: blocked_by yang belum landed, atau ada tiket solo yang harus selesai dulu; tiket yang dijeda pemilik (pause-before) tetap di baris depan; (b) hanya yang blocked_by-nya belum landed; (c) semua yang oleh 'k2 ready'/'k2 next' belum boleh mulai, termasuk yang dijeda. Saran: (a): baris belakang berarti 'menunggu tiket lain', jeda adalah menunggu pemilik.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): baris belakang untuk tiket yang belum bisa mulai karena tiket lain (blocked_by belum landed, atau ada tiket solo yang harus selesai dulu); tiket yang dijeda pemilik tetap di baris depan. (owner, 2026-11-13)
- Q3 [answered] Beberapa tiket pindah ke todo hampir bersamaan (planner memindahkan seluruh antrean sekaligus): (a) si perencana membawa semuanya dalam satu jalan lalu menjejerkannya; (b) satu tiket tiap jalan. Saran: (a), seperti rombongan perahu; (b) lama untuk 7 tiket.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): tiket yang pindah ke todo hampir bersamaan dibawa dalam satu jalan lalu dijejerkan. (owner, 2026-11-13)
- Q4 [answered] Adegan lama 'Draughtsman menggambar di meja DRAWINGS sebelum memasang di papan' dibuang? (a) ya: si perencana membaca di papan pesanan lalu langsung membawa tiket ke meja todo; meja gambar tinggal sebagai tempatnya saat senggang; papan QUEUE diganti meja todo; (b) adegan menggambar dipertahankan di tengah jalan. Saran: (a), sesuai keputusan 26.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): adegan menggambar di meja DRAWINGS dibuang; si perencana membaca di papan pesanan lalu langsung membawa tiket ke meja todo; meja gambar menjadi tempatnya saat senggang; papan QUEUE diganti meja todo. (owner, 2026-11-13)
- Q5 [answered] Berapa tiket yang muat di meja todo? Sekarang papan QUEUE memuat 8 dan sisanya tidak digambar. (a) 8 di baris depan dan 8 di baris belakang, sisanya tidak digambar (batas yang sama seperti sekarang, dicatat di dokumen); (b) meja memanjang mengikuti jumlah tiket. Saran: (a).
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): 8 di baris depan dan 8 di baris belakang, sisanya tidak digambar; batas ini dicatat di dokumen. (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Pertanyaan planner adalah pertanyaan yang belum terjawab dan dicatat oleh planner (kejadian 'question' dengan 'by' berawalan 'planner:').
  Why: Linimasa sudah mencatat siapa yang menjalankan tiap langkah (field 'by' dari role guard); tidak perlu catatan baru.
  If wrong: Ganti dengan: semua pertanyaan belum terjawab pada tiket di backlog.

## Decisions
- Lane standard: adegan dan benda baru di galangan. Menunggu 261113190702 (antrean adegan) dan 261113191201 (catatan planner di papan).
- Dipecah: catatan planner di inti dan hook menjadi tiket 261113191201, supaya bagian inti bisa dicoba sendiri dan berjalan lebih dulu di samping tiket lain.
