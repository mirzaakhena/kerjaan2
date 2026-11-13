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

Di galangan 0.16.0 Foreman membawa gulungan tiket ke dok kosong, dan dok
selalu empat: tiket kelima yang sedang berjalan menunggu sebagai gulungan.
Pemilik memutuskan (keputusan 27 dan 28 di `docs/galangan-tahap2.md`): tiap
tukang menjemput tiketnya sendiri dari wadah todo, dan jumlah dok mengikuti
`max_parallel` papan. Tiket ini dibangun di atas pemutar linimasa.

## Request

Saat sebuah tiket mulai dikerjakan, tukang dok itu berjalan ke wadah todo,
mengambil tiketnya, dan kembali ke doknya untuk mulai membangun. Jumlah dok
sama dengan `max_parallel` papan: sampai enam dalam satu baris, tujuh sampai
sepuluh dalam dua baris; bukan paging, bukan pulau terpisah.

## Done when

- [ ] Saat tiket mulai dikerjakan, tukang dok itu berjalan ke wadah todo, mengambil tiketnya, kembali ke doknya, dan baru sesudah ia tiba kapal mulai dibangun.
- [ ] Foreman tidak lagi mengantar tiket ke dok.
- [ ] Jumlah dok sama dengan `max_parallel` papan: satu sampai enam dalam satu baris, tujuh sampai sepuluh dalam dua baris, satu tukang untuk tiap dok.
- [ ] Bila `max_parallel` berubah selagi halaman terbuka, jumlah dok menyesuaikan dan tidak ada kapal yang hilang.
- [ ] Pada 1, 3, 6, dan 10 dok tidak ada dok, derek, mercusuar, atau jalur jalan yang saling bertumpuk.
- [ ] Mode `?demo` bisa dibuka dengan jumlah dok yang berbeda-beda. `docs/galangan-padanan.md` diperbarui.
- [ ] (owner) Galangan dengan 3, 6, dan 10 dok terlihat rapi di layar lebar dan di HP.

## Out of scope

Mengganti derek (tetap derek putar yang sekarang, keputusan 34). Karakter baru
untuk tukang tambahan: pakai karakter yang sudah ada.
