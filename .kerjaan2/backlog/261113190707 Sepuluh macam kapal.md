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

Di galangan 0.16.0 semua kapal serupa; hanya ukurannya berbeda menurut jumlah
kriteria tiket (kecil, sedang, besar). Pemilik memutuskan (keputusan 32 di
`docs/galangan-tahap2.md`): sepuluh macam kapal yang berbeda bentuk dan warna.
Paket model yang dipakai punya enam bentuk lambung (tiga ukuran, masing-masing
biasa dan bajak laut); sisanya dari warna layar dan bendera. Sepuluh calonnya
sudah ada di ruang pamer (`docs/mockups/galangan/`, kode C1–C10). Tiket ini
tidak bergantung pada tiket galangan lain.

## Request

Kapal di galangan ada sepuluh macam, berbeda bentuk dan warna, dan tiap tiket
selalu mendapat kapal yang sama, ditentukan dari ID-nya.

## Done when

- [ ] Ada sepuluh macam kapal yang bisa dibedakan satu sama lain dari bentuk lambung, warna layar, dan bendera.
- [ ] Tiket yang sama selalu mendapat kapal yang sama: sesudah halaman dimuat ulang, dan di perangkat lain.
- [ ] Macam kapal sebuah tiket sama sejak dibangun di dok sampai berlabuh di teluk.
- [ ] Ukuran kapal tetap mengikuti jumlah kriteria tiket (kecil, sedang, besar); ID menentukan lambung biasa atau bajak laut serta warna layar dan bendera.
- [ ] Hanya model yang benar-benar dimuat yang ikut disimpan di viewer.
- [ ] Mode `?demo` memperlihatkan beberapa macam kapal sekaligus. `docs/galangan-padanan.md` diperbarui.
- [ ] (owner) Kesepuluh macam kapal mudah dibedakan dan enak dilihat, di dok dan saat berlabuh.

## Out of scope

Bentuk kapal lain dari ruang pamer (D1–D12) dan pilihan kapal mana yang masuk
selain C1–C10 (ditunda).
