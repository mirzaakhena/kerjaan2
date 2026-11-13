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

- [x] Ada sepuluh macam kapal yang bisa dibedakan satu sama lain dari bentuk lambung, warna layar, dan bendera.
- [x] Tiket yang sama selalu mendapat kapal yang sama: sesudah halaman dimuat ulang, dan di perangkat lain.
- [x] Macam kapal sebuah tiket sama sejak dibangun di dok sampai berlabuh di teluk.
- [x] Ukuran kapal tetap mengikuti jumlah kriteria tiket (kecil, sedang, besar); hash kecil atas ID (bukan angka ID langsung) memilih satu dari sepuluh corak: delapan lambung biasa (layar putih, merah, toska, kuning, biru, hijau, jingga, ungu; bendera sewarna layar) dan dua bajak laut (layar hitam tengkorak; bendera merah atau putih).
- [x] Hanya model yang benar-benar dimuat yang ikut disimpan di viewer.
- [x] Mode `?demo` memperlihatkan beberapa macam kapal sekaligus. `docs/galangan-padanan.md` diperbarui.
- [x] (owner) Kesepuluh macam kapal mudah dibedakan dan enak dilihat, di dok dan saat berlabuh.

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
- A1 [confirmed] Model lambung bajak laut disalin dari docs/mockups/galangan/kits ke viewer/web/space/kits, hanya berkas yang dimuat; tiga ukuran bajak laut semuanya ikut karena ukuran mengikuti jumlah kriteria.
  Why: Uji menolak model yang ada tetapi tidak dimuat; pemilik memutuskan ukuran tetap dari kriteria.
  If wrong: Hapus berkas model yang tidak dipakai dan daftar muatnya.
  Confirmed by owner, 2026-11-13
- A2 [confirmed] Dua bajak laut dibedakan hanya dari bendera (merah tua atau putih); bendera diberi warna rata tanpa tekstur model.
  Why: Layar hitam tengkorak digambar di model dan tidak bisa diwarnai; jawaban Q1 menyebut bendera merah atau putih.
  If wrong: Ubah warna di LIVERY (viewer/web/space/world.js).
  Confirmed by owner, 2026-11-13
- A3 [confirmed] Di dok, sebelum lulus, corak hanya terlihat dari bentuk lambung (biasa atau bajak laut); warna baru tampak saat layar dan bendera dipasang sesudah lulus.
  Why: Aturan lama: layar dan bendera dipasang saat reviewer meluluskan; tiket ini tidak mengubahnya.
  If wrong: Tambahkan tanda warna pada lambung yang belum berlayar di makeShip.
  Confirmed by owner, 2026-11-13
- A4 [confirmed] Demo memilih ID buatannya supaya kesepuluh corak muncul bergiliran, dengan satu bajak laut di antara tiga kapal pertama yang berlabuh.
  Why: Kriteria meminta demo memperlihatkan beberapa macam sekaligus; ID acak bisa kebetulan serupa.
  If wrong: Kembalikan pembuatan ID di viewer/web/space/demo.js ke nomor urut biasa.
  Confirmed by owner, 2026-11-13

## Decisions
- Lane standard: rupa saja, tetapi menyentuh model, world.js, director.js dan uji daftar model; lebih dari perubahan kecil. Tidak menunggu apa pun; dijalankan sebelum 261113190702 karena 261113190702 solo.
- Keputusan pemilik: macam kapal ditentukan dari hash kecil atas ID tiket, lalu mod jumlah macam; bukan angka ID langsung di-mod, karena ID adalah cap waktu yang berurutan. Ukuran tetap mengikuti jumlah kriteria.
- Nama corak dan aturan hash ada di plan.js (murni, diuji di Node); warna ada di world.js. Uji mengunci hasil hash untuk empat ID, karena mengubah aturan mengganti kapal semua tiket di semua papan.

## Manual checks
- M1 [ok] (item 7) 1. Jalankan k2 view dari sumber tiket ini (atau setelah di-merge dan /plugin update kerjaan2), buka sebuah proyek, lalu halaman Shipyard.
  2. Klik Demo.
  3. Lihat tiga kapal yang berlabuh di teluk: corak mereka berbeda, salah satunya bajak laut berlayar hitam.
  4. Biarkan demo berjalan beberapa menit: tiap kapal baru yang lulus mendapat layar dan bendera dengan corak berikutnya, sampai kesepuluh corak lewat (putih, merah, toska, kuning, biru, hijau, jingga, ungu, bajak laut bendera merah, bajak laut bendera putih).
  5. Perhatikan di dok: sebelum lulus kapal belum berlayar, jadi yang terlihat hanya lambung biasa atau lambung bajak laut yang lebih gelap. Yang seharusnya terlihat: kesepuluh corak mudah dibedakan dan enak dilihat, di dok dan saat berlabuh.
  Checked by owner, 2026-11-13

## Handoff
Kapal galangan kini sepuluh corak. plan.js: LIVERIES dan liveryOf(id) (hash FNV kecil atas ID, lalu mod 10); picture() membawa livery. world.js: makeShip(size, livery) memilih lambung biasa atau bajak laut menurut ukuran, dengan bahan terpisah untuk layar dan bendera; tiga model ship-pirate-* ditambahkan ke kits dan ke KIT. director.js meneruskan livery. demo.js memilih ID agar semua corak muncul. Jangan rusak: urutan LIVERIES dan rumus liveryOf (mengubahnya mengganti kapal semua tiket); daftar KIT harus sama dengan isi folder kits; ukuran tetap dari jumlah kriteria.

## Review
- 2026-11-13 standard, round 1, at 1ccc9c1: passed.
  1: Uji 'ten ships' lulus di salinan: LIVERY = LIVERIES. Keenam GLB saya urai: simpul sail-*/flag-* ada; layar biasa hampir putih (bisa diwarnai), layar dan lambung bajak laut gelap. Gambar akhir makeShip di peramban tidak bisa dijalankan di sini: dinilai dengan membaca.
  2: liveryOf di dua proses Node terpisah memberi hasil sama untuk lima ID; ID angka = ID teks; tak ada simpanan peramban atau acak di plan.js/world.js/director.js. Uji mengunci empat ID.
  3: Uji Director lulus: tiga tiket in_progress -> review -> done, objek kapal di teluk adalah yang dibuat di dok, corak sama. make.ship hanya dipanggil di launchShip.
  4: Uji: ukuran ikut jumlah kriteria di keenam status. Saya hitung 20.000 ID berurutan: tiap corak 1899-2139. Hash FNV, bukan digit ID. Delapan warna layar, dua bendera bajak laut (merah, putih); bendera = flag ?? sail.
  5: Saya bandingkan sendiri: 49 model di folder kits = 49 nama di world.js/cast.js. Hanya tiga ship-pirate-*.glb ditambahkan, semuanya di KIT. Uji 'a page of its own per board' lulus.
  6: startDemo dijalankan: tujuh tiket awal tujuh corak berbeda; yang berlabuh pirate-red, red, blue. docs/galangan-padanan.md punya baris ID tiket dan bagian 'Sepuluh macam kapal' yang cocok dengan kode.
  7: (owner) M1 bisa diikuti dari awal dan berakhir pada apa yang harus terlihat.
  note: uji sutradara memakai make.ship tiruan; makeShip asli (bahan layar dan bendera) tidak dijalankan uji mana pun, hanya terlihat lewat M1. Repo tidak punya pemeriksaan selain perintah uji.
