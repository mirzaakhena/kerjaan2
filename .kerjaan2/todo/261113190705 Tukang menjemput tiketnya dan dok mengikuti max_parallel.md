---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: [261113190702]
related: [261113190704, 261113190706]
touches: [viewer/web/space/director.js, viewer/web/space/world.js, viewer/web/space/cast.js, viewer/web/space/main.js, viewer/web/space/plan.js, viewer/web/space/demo.js, viewer/snapshot.mjs, tests/viewer.test.mjs, docs/galangan-padanan.md]
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

<!-- k2:record — written by k2 only; do not edit by hand -->

## Questions
- Q1 [answered] Kapan tukang berangkat menjemput? (a) saat 'k2 start' dok disiapkan untuk tiket itu (papan nama dipasang), dan tukang baru berjalan ke meja saat worker tercatat dikirim (kejadian 'agent' worker), seperti tabel usul; (b) tukang langsung berjalan saat 'k2 start'. Saran: (a), karena yang bekerja adalah worker, bukan 'start'.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): saat 'k2 start' dok disiapkan (papan nama dipasang); tukang baru berjalan ke meja saat worker tercatat dikirim (kejadian 'agent' worker). (owner, 2026-11-13)
- Q2 [answered] Tiket yang berjalan bisa lebih banyak daripada dok: tiket yang hanya menunggu pemilik tidak memakai jatah max_parallel, dan kapal yang lulus tetap di dok sampai landed. Bila semua dok terisi: (a) tiket berikutnya menunggu sebagai gulungan di meja todo sampai ada dok kosong, seperti sekarang, dan batas ini dicatat; (b) jumlah dok = max_parallel ditambah cadangan 2 (tetap paling banyak 10). Saran: (a), setia pada keputusan 28.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): bila semua dok terisi, tiket berikutnya menunggu sebagai gulungan di meja todo sampai ada dok kosong; batas ini dicatat. (owner, 2026-11-13)
- Q3 [answered] max_parallel lebih dari 10: (a) galangan tetap 10 dok, sisanya menunggu seperti di Q2; (b) lain. Saran: (a).
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): max_parallel lebih dari 10: galangan tetap 10 dok, sisanya menunggu seperti di Q2. (owner, 2026-11-13)
- Q4 [answered] max_parallel diturunkan selagi dok yang akan hilang masih berisi kapal: (a) dok itu tinggal sampai kapalnya pergi, baru dibongkar; (b) kapalnya dipindah ke dok lain yang kosong. Saran: (a), tanpa adegan pindah.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): dok yang akan hilang tinggal sampai kapalnya pergi, baru dibongkar. (owner, 2026-11-13)
- Q5 [answered] Dua baris (7-10 dok): bagaimana kapal baris belakang meluncur ke laut? (a) baris belakang digeser setengah langkah sehingga tiap landasannya lewat di sela dua dok depan; (b) kedua baris berjajar di tepi air pada dua sisi dermaga yang berbeda (bentuk L), masing-masing langsung ke laut; (c) serahkan kepada worker, pemilik menilai lewat cek tangan. Saran: (a); bila ternyata tidak muat, worker mencatat alasannya dan memakai (b).
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): baris belakang digeser setengah langkah sehingga tiap landasannya lewat di sela dua dok depan; bila ternyata tidak muat, worker mencatat alasannya dan memakai dua sisi dermaga (bentuk L). (owner, 2026-11-13)
- Q6 [answered] Foreman tidak lagi mengantar tiket. Ia (a) tetap di daftar pemeran sebagai mandor dengan pekerjaan kecil pengisi waktu dan menyapa tukang saat 'k2 start' (dok disiapkan); (b) dikeluarkan dari daftar pemeran. Saran: (a): mandor tetap ada di kerjaan2, dan perannya yang lain belum diputuskan.
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): Foreman tetap di daftar pemeran dengan pekerjaan kecil pengisi waktu dan menyapa tukang saat dok disiapkan. (owner, 2026-11-13)
- Q7 [answered] Tukang tambahan (dok 5-10): (a) bernama Shipwright 5 sampai Shipwright 10, memakai ulang model karakter tukang yang ada dengan warna atau urutan berbeda, dan daftar pemeran di kiri bisa digulir; (b) daftar pemeran hanya menampilkan tukang yang doknya terisi. Saran: (a).
  → Pemilik: "Semua ikut saran (Recommended)". Jadi (a): tukang tambahan bernama Shipwright 5 sampai Shipwright 10, memakai ulang model karakter tukang yang ada; daftar pemeran bisa digulir. (owner, 2026-11-13)

## Assumptions
- A1 [unseen] Mode demo memilih jumlah dok lewat parameter alamat (misalnya ?demo&docks=6); tanpa parameter memakai 4.
  Why: Demo sudah dipilih lewat parameter alamat; tidak ada tempat lain untuk mengaturnya.
  If wrong: Ganti nama parameter atau nilai bawaannya di demo.js.

## Decisions
- Lane standard: tata letak dok dan pemeran berubah di banyak berkas. Menunggu 261113190702.
