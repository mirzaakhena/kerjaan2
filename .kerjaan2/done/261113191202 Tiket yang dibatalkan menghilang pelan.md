---
type: feature
priority: medium
lane: light
labels: []
blocked_by: [261113190702]
related: [261113190702]
touches: [viewer/web/space/director.js, viewer/web/space/demo.js, tests/viewer.test.mjs, docs/galangan-padanan.md]
created: 2026-11-13 19:12
---

## Background

Di galangan 0.16.0 tiket yang dibatalkan diberi cerita: tukang membongkar
lambungnya dan membawa kayunya pergi, atau Courier membuang gulungannya ke
tumpukan kayu. Pemilik memutuskan (keputusan 31 di
`docs/galangan-tahap2.md`): cancel tidak diberi cerita, tokennya menghilang
pelan. Keputusan ini tidak termuat di tujuh tiket galangan tahap 2 yang
pertama; tiket ini dibuat planner supaya tidak terlewat. Tiket ini dibangun di
atas pemutar linimasa.

## Request

Tiket yang dibatalkan tidak lagi diberi cerita di galangan: tokennya
(gulungan atau kapal) memudar pelan lalu hilang, tanpa ada pemeran yang
mendatanginya.

## Done when

- [x] Saat sebuah tiket dibatalkan, tokennya memudar pelan lalu hilang, di mana pun ia berada: papan pesanan, wadah todo, atau dok.
- [x] Tidak ada pemeran yang berjalan atau bekerja karena pembatalan itu: tukang tidak membongkar lambung, Courier tidak membuang gulungan.
- [x] Dok atau tempat yang ditinggalkan langsung bisa dipakai tiket lain.
- [x] Tiket yang sudah dibatalkan saat halaman dibuka tidak tampil sama sekali.
- [x] Mode `?demo` memperlihatkan satu tiket dibatalkan. `docs/galangan-padanan.md` diperbarui.
- [ ] (owner) Menghilangnya terlihat pelan dan tenang, tidak mengejutkan.

## Out of scope

Tiket yang dibuka lagi sesudah dibatalkan: langsung diletakkan di tempatnya
tanpa cerita, seperti sekarang.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Berapa lama token memudar? (a) sekitar 2 detik; (b) sekitar 5 detik. Saran: (a).
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): token memudar sekitar 2 detik. (owner, 2026-11-13)

## Decisions
- Lane light: satu adegan diganti dengan memudar, murah dibatalkan. Menunggu 261113190702. Dibuat planner karena keputusan 31 tidak termuat di tujuh tiket pertama.

## Manual checks
- M1 [waiting] (item 6) 1. Buka halaman galangan dengan ?demo.
  2. Tunggu ronde kedua perencana (sekitar 80 detik).
  3. Satu gulungan di papan pesanan memudar pelan sekitar 2 detik lalu hilang, tanpa ada yang mendatanginya. Boleh juga batalkan tiket yang sedang berlayar di papan sungguhan: kapalnya memudar di dok dan dok langsung kosong.

## Handoff
Pembatalan tiket di galangan kini tanpa cerita. Director.scrap tidak lagi memberi pekerjaan ke Shipwright atau Courier: objek token (gulungan atau kapal) dilepas dari tiket, put(tok,'scrap') membebaskan dok, jangkar, dan slot seketika, lalu world.fade (baru, 2 detik, material dikloning agar tak memudarkan yang lain) memudarkan dan membuangnya. Properti breaking dan kata TIMBER di komentar dihapus. Demo membatalkan satu pesanan pasti di ronde kedua. Jangan sampai put() untuk scrap menyentuh objek yang sedang memudar.

## Review
- 2026-11-13 conflict resolution, at d3aba9f: passed.
  Gabungan d3aba9f menjaga kedua sisi: scrap() tanpa pemeran + world.fade 2 dtk (breaking terhapus), dan 'ready'/fetch/setDocks/rig/stay/jangkar dari main utuh. Uji hanya disesuaikan: sesudah batal, tiket yang distart jadi 'ready'. Dinilai dengan membaca diff gabungan; uji penuh tidak diulang.
