---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
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

- [ ] Beberapa tiket yang dibuat berdekatan datang dengan satu perahu sebagai satu rombongan; tiket yang dibuat jauh sesudahnya datang dengan perahu berikutnya. Jarak waktu yang dianggap "berdekatan" tertulis di dokumen galangan.
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
