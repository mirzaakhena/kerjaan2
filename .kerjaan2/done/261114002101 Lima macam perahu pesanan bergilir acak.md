---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-14 00:21
---

## Background

Di galangan 0.18.0 tiket baru selalu datang dengan perahu yang sama: perahu
dayung kecil (E1 di ruang pamer, `docs/mockups/galangan/`). Saat tiket perahu
rombongan ditulis, bentuk perahu sengaja ditunda. Pemilik (14 November 2026)
meminta semua calon perahu ikut membawa tiket dan bergilir secara acak: E1,
E2 (perahu layar), dan ketiga perahu E5 (dua kapal tunda dan satu kapal
tarik). Jadi lima macam perahu pesanan.

Dua dari bentuk E5 sekarang sudah mengapung di pelabuhan sebagai hiasan (satu
kapal tunda di teluk, satu kapal tarik dekat mercusuar). Pemilik memutuskan
kedua hiasan itu dihapus, dan usul lama "kapal tunda sebagai tanda merge"
dicoret: bentuk itu hanya untuk perahu pesanan.

Tiket derek (261114001801) sedang dikerjakan berdampingan dan mengubah berkas
galangan yang sama; pemilik memilih keduanya berjalan bersamaan.

## Request

Perahu yang membawa rombongan tiket baru adalah salah satu dari lima macam
perahu (E1, E2, dan ketiga perahu E5), dipilih secara acak untuk tiap
rombongan. Alurnya tetap: datang dari ujung laut, berlabuh di dermaga, Courier
mengambil peti, perahu pergi ke sisi lain dan menghilang.

## Done when

- [x] Kelima macam perahu (E1, E2, dan ketiga perahu E5) bisa datang membawa rombongan tiket, dan tiap rombongan mendapat salah satunya secara acak; dalam banyak rombongan berturut-turut kelimanya muncul, dan dua rombongan berurutan tidak selalu memakai perahu yang sama.
- [x] Rombongan yang sama memakai perahu yang sama di dua halaman yang dibuka bersamaan.
- [x] Tiap macam perahu berlabuh rapat di dermaga tanpa menembus dermaga, menghadap arah lajunya saat datang dan pergi, dan petinya terlihat di atas perahu sampai Courier mengambilnya.
- [x] Perahu yang lebih besar dari perahu dayung tetap bisa memutari ujung dermaga dan pergi ke sisi lain tanpa menembus dermaga atau daratan.
- [x] Kapal tunda dan kapal tarik hiasan tidak ada lagi di pelabuhan, sehingga bentuk itu hanya terlihat saat membawa pesanan; perahu hiasan lainnya tetap.
- [x] Hanya model yang benar-benar dimuat yang ikut disimpan di viewer.
- [x] Mode `?demo` memperlihatkan perahu yang berganti-ganti dari rombongan ke rombongan. `docs/galangan-padanan.md` diperbarui, dan `docs/galangan-tahap2.md` mencatat dua keputusan pemilik: kedua hiasan itu dihapus, dan usul "kapal tunda sebagai tanda merge" dicoret.
- [x] (owner) Kelima perahu enak ditonton saat datang, berlabuh, dan pergi.

## Out of scope

Kapal tunda sebagai tanda merge (belum diputuskan pemilik). Memilih perahu
menurut besar rombongan.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [confirmed] Perahu rombongan ditentukan oleh hash ID tiket pertama rombongan itu, bukan angka acak per halaman
  Why: Hanya dengan begitu dua halaman yang terbuka memperlihatkan perahu yang sama untuk rombongan yang sama
  If wrong: Ganti boatOf di viewer/web/space/plan.js
  Confirmed by owner, 2026-11-14
- A2 [confirmed] Saat merapat perahu berputar di lepas dermaga lalu bergeser menyamping ke tempat labuhnya; haluan searah laju sampai titik putar itu dan saat pergi
  Why: Perahu harus berlabuh dengan haluan ke laut supaya bisa memutari ujung dermaga, dan kapal tarik terlalu panjang untuk berbelok sambil merapat tanpa menyentuh dermaga
  If wrong: Ubah kaki-kaki lintasan di courseOf (plan.js); uji lintasan menolak yang menembus dermaga
  Confirmed by owner, 2026-11-14
- A3 [confirmed] Dua model perahu dipindah dari kits ruang pamer ke kits viewer (bukan disalin), dan mock.js memuatnya dari viewer
  Why: Menghindari dua salinan berkas yang sama
  If wrong: Salin kembali ke docs/mockups/galangan/kits dan kembalikan daftar di mock.js
  Confirmed by owner, 2026-11-14

## Manual checks
- M1 [ok] (item 8) 1. Jalankan k2 view, buka halaman galangan proyek ini dan tambahkan ?demo pada alamatnya.
  2. Tunggu rombongan pertama: perahu layar datang dari ujung laut, berputar, merapat; Courier mengambil peti; perahu memutari ujung dermaga dan menghilang.
  3. Biarkan beberapa menit: berikutnya kapal tunda jingga, kapal tunda hijau, kapal tarik biru, lalu perahu dayung.
  4. Seharusnya terlihat: kelimanya enak ditonton saat datang, berlabuh dan pergi, dan tidak ada lagi kapal tunda atau kapal tarik hiasan di pelabuhan.
  Checked by owner, 2026-11-14

## Handoff
Perahu pesanan kini satu dari lima lambung (BOATS di plan.js), dipilih boatOf dari ID tiket pertama rombongan; director meneruskannya ke world.mailIn(pace, kind). Lintasan tiap lambung dihitung courseOf (plan.js) dan world.js hanya memutarnya; PIER dan BUOY di plan.js adalah letak dermaga dan pelampung yang juga dipakai world.js. Jejak dermaga di footprints melebar mengikuti lambung terlebar. Kapal tunda keliling teluk dan kapal tarik dekat mercusuar dihapus. Jangan sampai rusak: uji lintasan (dermaga, daratan, pelampung, jalur luncur pada 1-10 dok), kesamaan perahu di dua halaman, dan giliran lima perahu di demo.

## Review
- 2026-11-14 standard, round 1, at 1b98fee: passed.
  1: Uji 'five boats bring the orders' dijalankan menurut namanya, lulus. Hitungan saya sendiri atas 3000 ID: tiap perahu 19-21%, dua berurutan sama 20%. Director meneruskan boatOf(tiket pertama) ke mailIn.
  2: Uji yang sama: dua Director, delapan rombongan, urutan perahu sama persis. Dua jendela peramban pada papan sungguhan tidak dicoba (tidak ada peramban di sini).
  3: BOATS cocok dengan kotak batas kelima .glb, haluan di +z. Pemeriksaan lintasan saya sendiri (lambung lawan dermaga, daratan, pelampung; 2000 langkah per kaki): 0 sentuhan, jarak labuh 0,25. Peti berdiri di permukaan geladak tiap model; terlihatnya dinilai dari geometri, bukan gambar.
  4: Pemeriksaan yang sama untuk kaki-kaki pergi: 0 sentuhan, termasuk kapal tarik; uji 'each of the five boats' (jalur luncur 1-10 dok) lulus.
  5: Uji 'order boats only' lulus; di diff kedua float() hiasan dan gerak tug di update() dihapus, perahu nelayan dan perahu layar timur tetap.
  6: Uji 'the yard: a page of its own per board' (model bernama = isi kits, dua arah) lulus; semua 27 model yang dimuat mock.js ada di tempat yang ditunjuknya.
  7: Uji 'the demo sends the five order boats in turn' lulus (startDemo sungguhan, tujuh perahu). Padanan memuat bagian lima perahu; tahap2 memuat keputusan 37 dan 38, usul lama dicoret.
  8: (owner) M1 bisa diikuti dari awal dan berakhir pada apa yang harus terlihat.
  note: Saat datang haluan searah laju hanya sampai titik putar; lalu perahu berputar sambil mundur 2,5 satuan dan bergeser menyamping 0,7-2,2 satuan (asumsi A2, belum dilihat pemilik, tercatat sebagai batas). Tidak saya tahan: perahu harus berlabuh haluan ke laut. Pemilik menilainya di M1.
  note: Kaki pertama saat pergi selalu 2 detik: kapal tarik menempuh 7,8 satuan, perahu dayung 3,5. Soal rupa, untuk M1.
  note: Repo tidak menawarkan pemeriksaan lain selain perintah uji; tidak ada yang dinilai dari gambar.
