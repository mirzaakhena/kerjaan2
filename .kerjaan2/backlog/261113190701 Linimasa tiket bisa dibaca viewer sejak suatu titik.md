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

Halaman galangan (`k2 view`, halaman 3D tiap papan) sekarang hanya menerima
keadaan papan dan kejadian terakhir tiap tiket. Pemilik memutuskan galangan
memutar hidup tiket kejadian demi kejadian (keputusan 24 di
`docs/galangan-tahap2.md`). Untuk itu halaman perlu semua kejadian linimasa
sejak titik yang sudah ia lihat, bukan hanya yang terakhir. Viewer hanya
membaca papan dan tidak pernah menulis; itu tetap berlaku.

Ini tiket pertama dari tujuh untuk galangan tahap 2; pemutar linimasa
dibangun di atasnya.

## Request

Viewer menyediakan jalan hanya-baca untuk mengambil kejadian linimasa
tiket-tiket sebuah papan sejak suatu titik, sehingga halaman yang terbuka
tidak melewatkan kejadian dan tidak menerima kejadian yang sama dua kali.

## Done when

- [ ] Halaman bisa meminta kejadian sebuah papan sejak suatu titik dan hanya menerima kejadian sesudah titik itu, berurutan menurut waktu, tiap kejadian menyebut tiketnya.
- [ ] Permintaan tanpa titik tidak memberi sejarah, hanya titik "sekarang" untuk dipakai pada permintaan berikutnya.
- [ ] Permintaan berturut-turut, masing-masing memakai titik dari jawaban sebelumnya, tidak kehilangan dan tidak mengulang kejadian, juga bila kejadian ditulis di antara dua permintaan.
- [ ] Kejadian terakhir tiket yang selesai atau dibatalkan sesudah titik itu (misalnya `landed`) tetap terkirim.
- [ ] Baris linimasa yang rusak dilewati dan tidak menggagalkan permintaan.
- [ ] Jalan ini hanya menjawab GET dan tidak mengubah apa pun di papan.

## Out of scope

Mengubah halaman galangan supaya memakai jalan ini (tiket pemutar linimasa).
