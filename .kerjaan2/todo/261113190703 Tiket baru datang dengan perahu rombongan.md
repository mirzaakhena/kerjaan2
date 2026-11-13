---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: [261113190702]
related: []
touches: [viewer/web/space/director.js, viewer/web/space/world.js, viewer/web/space/cast.js, viewer/web/space/demo.js, tests/viewer.test.mjs, docs/galangan-padanan.md]
created: 2026-11-13 19:07
---

## Background

Di galangan 0.16.0 tiap tiket baru memanggil perahu pos dan Courier
sendiri-sendiri. Pemilik memutuskan (keputusan 25 di
`docs/galangan-tahap2.md`): tiket yang dibuat berdekatan datang sebagai satu
rombongan dengan satu perahu kecil, dan Courier hanya ke dermaga bila ada
perahu yang menepi. Tiket ini dibangun di atas pemutar linimasa.

## Request

Tiket yang baru dibuat datang ke galangan dengan perahu rombongan: satu perahu
kecil dari ujung laut membawa semua tiket yang dibuat berdekatan, berlabuh di
dermaga, lalu pergi ke sisi lain dan menghilang. Courier menjemputnya dan
menaruh semuanya di papan pesanan.

## Done when

- [ ] Beberapa tiket yang dibuat berdekatan datang dengan satu perahu sebagai satu rombongan; tiket yang dibuat jauh sesudahnya datang dengan perahu berikutnya. "Berdekatan" berarti dibuat dalam 60 detik sesudah tiket sebelumnya, selagi perahu belum pergi; jarak itu tertulis di dokumen galangan.
- [ ] Perahu datang dari ujung laut, berlabuh di dermaga, lalu pergi ke sisi lain dan menghilang.
- [ ] Courier hanya berjalan ke dermaga bila ada perahu yang menepi, dan menaruh semua tiket rombongan itu di papan pesanan.
- [ ] Tiket baru tidak terlihat di papan pesanan sebelum Courier menaruhnya.
- [ ] Tiket yang lahir sebagai usulan sesudah tiket lain selesai datang dengan cara yang sama.
- [ ] Mode `?demo` memperlihatkan satu rombongan berisi lebih dari satu tiket. `docs/galangan-padanan.md` diperbarui.
- [ ] (owner) Kedatangan dan kepergian perahu serta kerja Courier enak ditonton.

## Out of scope

Bentuk perahu yang baru (pilihan E1 atau E2 di ruang pamer ditunda; pakai
perahu yang sekarang). Lonceng Keeper yang memanggil Courier (belum
diputuskan pemilik).

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Berapa jarak waktu yang dianggap 'berdekatan' untuk satu rombongan? (a) tiket yang dibuat dalam 60 detik sesudah tiket sebelumnya ikut perahu yang sama; (b) 30 detik; (c) 5 menit. Saran: (a): tiket buatan mandor lahir beruntun dalam hitungan detik, dan 60 detik masih terasa satu kiriman.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): tiket yang dibuat dalam 60 detik sesudah tiket sebelumnya ikut perahu yang sama. (owner, 2026-11-13)
- Q2 [answered] Perahu harus tahu rombongannya lengkap sebelum berangkat, padahal galangan tidak boleh mendahului papan. (a) perahu berangkat begitu tiket pertama terlihat, dan tiket yang dibuat selagi perahu masih di jalan atau di dermaga ikut naik; yang lahir sesudah perahu pergi menunggu perahu berikutnya; (b) galangan menunggu dulu selama jarak 'berdekatan' sebelum perahu muncul. Saran: (a), tidak menambah keterlambatan.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): perahu berangkat begitu tiket pertama terlihat; tiket yang dibuat selagi perahu masih di jalan atau di dermaga ikut naik; yang lahir sesudah perahu pergi menunggu perahu berikutnya. (owner, 2026-11-13)
- Q3 [answered] Rombongan besar (lebih dari yang muat dibawa Courier sekali jalan, misalnya 9 tiket): (a) Courier sekali jalan membawa satu peti, semua tiket muncul di papan pesanan saat ia tiba; (b) Courier bolak-balik, paling banyak 3 tiket tiap jalan, perahu menunggu sampai habis. Saran: (a), supaya rombongan besar tidak menahan adegan lain.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): Courier sekali jalan membawa satu peti; semua tiket rombongan muncul di papan pesanan saat ia tiba. (owner, 2026-11-13)

## Decisions
- Lane standard: adegan baru di beberapa berkas galangan. Menunggu 261113190702 (antrean adegan per tiket).
