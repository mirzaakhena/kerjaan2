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

- [x] Saat tiket mulai dikerjakan, tukang dok itu berjalan ke wadah todo, mengambil tiketnya, kembali ke doknya, dan baru sesudah ia tiba kapal mulai dibangun.
- [x] Foreman tidak lagi mengantar tiket ke dok.
- [x] Jumlah dok sama dengan `max_parallel` papan: satu sampai enam dalam satu baris, tujuh sampai sepuluh dalam dua baris, satu tukang untuk tiap dok.
- [x] Bila `max_parallel` berubah selagi halaman terbuka, jumlah dok menyesuaikan dan tidak ada kapal yang hilang.
- [x] Pada 1, 3, 6, dan 10 dok tidak ada dok, derek, mercusuar, atau jalur jalan yang saling bertumpuk.
- [x] Mode `?demo` bisa dibuka dengan jumlah dok yang berbeda-beda. `docs/galangan-padanan.md` diperbarui.
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
- A1 [confirmed] Mode demo memilih jumlah dok lewat parameter alamat (misalnya ?demo&docks=6); tanpa parameter memakai 4.
  Why: Demo sudah dipilih lewat parameter alamat; tidak ada tempat lain untuk mengaturnya.
  If wrong: Ganti nama parameter atau nilai bawaannya di demo.js.
  Confirmed by owner, 2026-11-13
- A2 [confirmed] Pekerjaan tanpa worker tercatat (check, uncheck, void, submitted, verdict) dianggap tiketnya sudah dijemput: tukang menjemput dulu, lalu lambung bergerak. Halaman yang baru dibuka menganggap tiket belum dijemput hanya bila kejadian terakhirnya masih 'started'.
  Why: Hook tidak selalu mencatat worker; tanpa ini kapal tidak pernah muncul.
  If wrong: Ubah play() dan begun di viewer/web/space/plan.js.
  Confirmed by owner, 2026-11-13

## Decisions
- Lane standard: tata letak dok dan pemeran berubah di banyak berkas. Menunggu 261113190702.
- Dua baris memakai 4+3, 5+3, 5+4, 6+4 supaya tiap landasan belakang benar-benar di sela dua dok depan (jawaban Q5); akibatnya dok depan direnggangkan 12,4 dan pulau melebar sampai 1,5 kali pada 10 dok. Bentuk L tidak diperlukan.
- Papan nama tiket dipindah dari sisi kiri dok ke tengah kepala landasan, karena di sisi ia menghalangi lorong dan landasan baris belakang.

## Manual checks
- M1 [waiting] (item 7) 1. Jalankan k2 view dari sumber repo ini (setelah tiket ini masuk main) dan buka /p/kerjaan2/space?demo&docks=3 di layar lebar.
  2. Lihat: tiga dok satu baris, tiga Shipwright di daftar kiri, tidak ada yang bertumpuk.
  3. Klik tautan 6 lalu 10 di catatan demo kuning: enam dok satu baris; sepuluh dok dua baris (6 di depan, 4 di belakang yang landasannya lewat di sela dok depan), derek dan mercusuar di ujung timur, dermaga pos di barat.
  4. Tunggu sampai satu tiket mulai: papan nama muncul di dok kosong, lalu tukang dok itu berjalan ke papan QUEUE, membawa gulungan kembali, baru lunas muncul.
  5. Ulangi langkah 1-3 di HP (atau jendela sempit): seluruh pulau terlihat dengan tombol Whole yard, daftar pemeran di bawah bisa digeser. Yang diharapkan: pada 3, 6, dan 10 dok galangan terlihat rapi di kedua ukuran.

## Handoff
Galangan: 'started' kini hanya menyiapkan dok (tempat baru 'ready' di plan.js: slip dipesan, gulungan tetap di papan QUEUE); 'agent' worker membuat tukang dok itu menjemput gulungan (director.fetch), lunas sesudah ia tiba. Adegan 'start' Foreman diganti 'prepare' dan 'fetch'. Jumlah dok = max_parallel: yardOf (plan.js) menghitung tata letak, world.setDocks membangun ulang dok dan menggeser bagian back/east/west, director.fit menyesuaikan slipOf dan tukang (cast.setWrights). Jangan rusak: 4 dok harus persis galangan lama; slip dibongkar hanya dari ujung dan tidak selagi kapal meluncur; stations dan slot diubah di tempat, jangan diganti objeknya; wadah todo masih stations.queue.

## Review
- 2026-11-13 standard, round 1, at d62ace4: passed.
  1: Uji 'a ticket that starts...' lulus dijalankan menurut nama; di Chrome tanpa kepala (k2 view atas salinan, ?demo&docks=7) terlihat urutannya: tiket 'ready' di slip 6 tanpa kapal, Shipwright 6 'fetching the drawing', gulungan hilang dari papan saat ia 'carrying ... to slip 6', kapal baru ada sesudah itu.
  2: Uji yang sama: catatan Foreman hanya 'to slip 2', tak pernah memegang gulungan; adegan 'start' tak ada lagi di director.js. Di peramban Foreman hanya 'having slip 6 made ready', lalu kembali ke pekerjaan kecil.
  3: Uji 'the yard has as many slips...' lulus (1-10, 14 menjadi 10). Di peramban docks=1,3,6,10: 1/3/6/10 dok, tukang dan baris daftar sama banyak; 6 satu baris, 10 = 6 depan + 4 belakang digeser setengah langkah.
  4: Uji 'max_parallel changes...' lulus. Di peramban demo 7 ke 10 ke 3 selagi terbuka: 9 kapal tetap 9, semuanya di adegan dan tepat di doknya; 10 dok dan 10 tukang saat naik, dok berisi tetap tinggal saat turun (jawaban Q4).
  5: Uji tapak 1-10 dok lulus; world.js memakai yardOf yang sama, dan potret dari atas dunia yang sebenarnya pada 1, 3, 6, 10 dok memperlihatkan dok, derek, mercusuar, dermaga, landasan belakang dan jalan tidak bertumpuk.
  6: ?demo&docks=1,3,6,10 dibuka di peramban tanpa galat konsol, tautan Slips ada di catatan demo; uji 'the demo can be opened...' lulus; docs/galangan-padanan.md punya bagian 'Tukang menjemput tiketnya' dan 'Dok mengikuti max_parallel'.
  7: (owner) M1 bisa diikuti dari awal dan berakhir pada apa yang harus terlihat; tidak dinilai di sini.
  note: tempat berdiri di sisi dok depan (3,7) hanya 0,1 dari sapuan kapal terlebar baris belakang (3,8): layak dilihat pemilik saat cek tangan. Tidak ada pemeriksaan lain di repo selain perintah uji (tanpa lint, tanpa CI). Tidak ada yang dinilai hanya dengan membaca.
- 2026-11-13 conflict resolution, at 6357f02: passed.
  Gabungan 6357f02 menjaga keduanya: Naval Architect dan meja todo dua baris (190704) serta prepare/fetch dan dok = max_parallel; meja TODO, 'reading', waitSlots ikut bagian back. Di Chrome (demo 1,3,6,7,10): tukang menjemput dari meja todo, 9 kapal tetap, tanpa galat. M1 langkah 4 masih menyebut papan QUEUE.
