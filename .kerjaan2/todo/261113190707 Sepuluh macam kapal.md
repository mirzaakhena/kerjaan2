---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: [viewer/web/space/world.js, viewer/web/space/director.js, viewer/web/space/plan.js, viewer/web/space/demo.js, viewer/web/space/kits/pirate, tests/viewer.test.mjs, docs/galangan-padanan.md]
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
- [ ] Ukuran kapal tetap mengikuti jumlah kriteria tiket (kecil, sedang, besar); hash kecil atas ID (bukan angka ID langsung) memilih satu dari sepuluh corak: delapan lambung biasa (layar putih, merah, toska, kuning, biru, hijau, jingga, ungu; bendera sewarna layar) dan dua bajak laut (layar hitam tengkorak; bendera merah atau putih).
- [ ] Hanya model yang benar-benar dimuat yang ikut disimpan di viewer.
- [ ] Mode `?demo` memperlihatkan beberapa macam kapal sekaligus. `docs/galangan-padanan.md` diperbarui.
- [ ] (owner) Kesepuluh macam kapal mudah dibedakan dan enak dilihat, di dok dan saat berlabuh.

## Out of scope

Bentuk kapal lain dari ruang pamer (D1–D12) dan pilihan kapal mana yang masuk
selain C1–C10 (ditunda).

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Jawaban pemilik (ukuran dari jumlah kriteria; ID memilih lambung dan warna) membuat C1-C10 tidak bisa dipakai apa adanya, karena tiap calon itu sudah terikat pada satu ukuran. Sepuluh macam itu jadinya: (a) sepuluh 'corak' yang dipilih ID dan berlaku untuk ukuran apa pun: delapan lambung biasa dengan warna layar putih, merah, toska, kuning, biru, hijau, jingga, ungu, dan dua bajak laut (layar hitam tengkorak; bendera merah atau putih); jadi kira-kira satu dari lima kapal bajak laut; (b) separuh bajak laut: lima warna x biasa/bajak laut; (c) susunan lain dari pemilik. Saran: (a), paling dekat dengan C1-C10.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): sepuluh corak yang berlaku untuk ukuran apa pun: delapan lambung biasa dengan layar putih, merah, toska, kuning, biru, hijau, jingga, ungu, dan dua bajak laut (layar hitam tengkorak; bendera merah atau putih). (owner, 2026-11-13)
- Q2 [answered] Warna bendera: (a) sama dengan warna layarnya (kecuali bajak laut); (b) dipilih ID terpisah dari warna layar, sehingga macamnya lebih dari sepuluh. Saran: (a), supaya tetap sepuluh macam yang mudah dikenali.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): warna bendera sama dengan warna layarnya, kecuali bajak laut. (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Model lambung bajak laut disalin dari docs/mockups/galangan/kits ke viewer/web/space/kits, hanya berkas yang dimuat; tiga ukuran bajak laut semuanya ikut karena ukuran mengikuti jumlah kriteria.
  Why: Uji menolak model yang ada tetapi tidak dimuat; pemilik memutuskan ukuran tetap dari kriteria.
  If wrong: Hapus berkas model yang tidak dipakai dan daftar muatnya.

## Decisions
- Lane standard: rupa saja, tetapi menyentuh model, world.js, director.js dan uji daftar model; lebih dari perubahan kecil. Tidak menunggu apa pun; dijalankan sebelum 261113190702 karena 261113190702 solo.
- Keputusan pemilik: macam kapal ditentukan dari hash kecil atas ID tiket, lalu mod jumlah macam; bukan angka ID langsung di-mod, karena ID adalah cap waktu yang berurutan. Ukuran tetap mengikuti jumlah kriteria.
