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

- [x] Beberapa tiket yang dibuat berdekatan datang dengan satu perahu sebagai satu rombongan; tiket yang dibuat jauh sesudahnya datang dengan perahu berikutnya. "Berdekatan" berarti dibuat dalam 60 detik sesudah tiket sebelumnya, selagi perahu belum pergi; jarak itu tertulis di dokumen galangan.
- [x] Perahu datang dari ujung laut, berlabuh di dermaga, lalu pergi ke sisi lain dan menghilang.
- [x] Courier hanya berjalan ke dermaga bila ada perahu yang menepi, dan menaruh semua tiket rombongan itu di papan pesanan.
- [x] Tiket baru tidak terlihat di papan pesanan sebelum Courier menaruhnya.
- [x] Tiket yang lahir sebagai usulan sesudah tiket lain selesai datang dengan cara yang sama.
- [x] Mode `?demo` memperlihatkan satu rombongan berisi lebih dari satu tiket. `docs/galangan-padanan.md` diperbarui.
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

## Assumptions
- A1 [unseen] Perahu tidak lagi tampak di laut bila tidak sedang membawa tiket (dulu selalu mengapung dekat dermaga).
  Why: Permintaan menyebut perahu datang dari ujung laut lalu menghilang.
  If wrong: Hapus mailBoat.visible = false di world.js dan beri perahu tempat tunggu.
- A2 [unseen] Courier selalu dipanggil untuk tiap perahu, juga bila antreannya sudah 3 pekerjaan; perahu menunggu di dermaga.
  Why: Satu perahu hanya satu pekerjaan, dan tiket tidak boleh muncul di rak sebelum Courier menaruhnya.
  If wrong: Kembalikan batas BUSY di Director.sail: bila Courier sibuk, perahu langsung pergi dan tiket diletakkan.

## Decisions
- Lane standard: adegan baru di beberapa berkas galangan. Menunggu 261113190702 (antrean adegan per tiket).
- Rombongan tertutup dan perahu pergi pada saat Courier mengangkat peti, bukan saat ia tiba di rak: itu saat 'perahu pergi' pada jawaban Q2, dan tiket yang lahir sesudahnya tidak bisa lagi masuk peti yang sudah dibawa.

## Manual checks
- M1 [waiting] (item 7) 1. Jalankan k2 view di repo ini dan buka /p/kerjaan2/space?demo.
  2. Putar kamera ke dermaga kayu di kiri depan.
  3. Dalam kira-kira 10 detik sebuah perahu dayung muncul kecil dari tepi luar laut, membesar, dan berlabuh di sisi dermaga.
  4. Courier berjalan ke ujung dermaga, mengangkat peti (balon '!'), dan berjalan ke rak ORDERS; keterangannya 'carrying 3 new orders to the office'.
  5. Saat peti diangkat perahu memutari ujung dermaga, pergi ke sisi kiri, mengecil dan hilang.
  6. Tiga gulungan muncul di rak ORDERS saat Courier tiba. Yang dinilai: enak ditonton atau tidak (kecepatan perahu, jalur pergi, ukuran peti).

## Handoff
Tiket baru (created) kini datang serombongan: Director.deliver menggabungkan tiket ke this.party bila joins() di plan.js benar (dibuat paling lama GROUP = 60 detik sesudah tiket sebelumnya dan perahu belum pergi), selain itu menunggu party.gone lalu memanggil perahu baru lewat sail(). Satu perahu berarti satu pekerjaan Courier; rombongan tertutup saat peti diangkat, dan semua tiketnya ditaruh di rak ketika Courier tiba. world.js: mailIn/mailOut kini janji yang selesai saat perahu berlabuh/hilang dan menerima kecepatan; ada mailTake dan make.crate. Jangan rusak: tiket tetap di 'mail' sampai Courier tiba; Courier tidak punya pekerjaan pengisi waktu di dermaga; hanya satu perahu pada satu waktu.

## Review
- 2026-11-13 standard, round 1, at 115576c: passed.
  1: Uji 'orders written close together come by one boat...' lulus: jarak 0/20/70 detik satu perahu satu jalan Courier, 60 detik lebih 1 ms perahu kedua. Di salinan, membuang 'await party.filed' menggagalkan uji. 60 detik tertulis di docs/galangan-padanan.md.
  2: mailIn/mailOut dari world.js dijalankan di salinan dengan objek tiruan: muncul kecil di tepi luar laut (-15, 25.4), berlabuh di (-25.4, 8.6) sisi kanan dermaga, memutari ujungnya ke (-31.7, 22.5) di sisi kiri, mengecil, visible=false. Uji urutan boat in/out lulus.
  3: Uji 'the boat comes in, lies at the pier...' lulus: perahu di jalan, antrean Courier 0; berlabuh, tepat 1 pekerjaan; tiga tiket ke rak dalam satu jalan. grep pierEnd: hanya di Director.sail, tidak ada di cast.js.
  4: Uji mencatat isi rak tiap langkah Courier: kosong saat ke dermaga dan saat menuju rak, terisi baru sesudah ia tiba; sebelum itu where() tetap 'mail', dan token di 'mail' tidak punya objek gambar.
  5: Uji 'an order proposed after another ticket landed...' lulus: dua created sesudah landed datang dengan satu perahu selagi kapal meluncur. Tiket baru, juga usulan, ditulis lewat satu B.log 'created' di core/cmd-board.mjs.
  6: Uji saya sendiri di salinan memutar startDemo lewat Director 15 kali: kiriman pertama selalu 3 created, satu 'boat in', keterangan 'carrying 3 new orders to the office'. docs/galangan-padanan.md punya bagian 'Perahu rombongan' dan baris tabel baru.
  7: (owner) M1 berisi langkah dari awal (k2 view, /p/kerjaan2/space?demo) sampai apa yang harus terlihat; bisa diikuti.
  note: Repo tidak punya pemeriksaan peramban, jadi tampilan nyata (arah haluan perahu, ukuran peti) tidak saya lihat; jalur dibuktikan lewat simulasi angka, sisanya di M1.
  note: 'fewer boats than orders' di uji demo lemah; kriteria 6 dibuktikan dengan uji sendiri. Jumlah di keterangan Courier ikut menghitung tiket yang hilang sebelum peti diangkat; kecil.
