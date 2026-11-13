---
type: task
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-13 23:48
---

## Background

Di galangan 0.18.0 hanya ada satu derek putar, di ujung timur dekat mercusuar.
Ia hanya mengayunkan lengannya saat operatornya datang; ia tidak mengangkat
apa pun dan tidak ikut membangun kapal. Pemilik (13 November 2026) tadinya
mengira derek berdiri di tiap dok dan bekerja membantu pembangunan selama
kapal dibangun, dan ingin melihat mockup lebih dulu, karena khawatir derek di
tiap dok menyempitkan ruang kapal.

Yang sudah diputuskan sebelumnya (keputusan 34 di `docs/galangan-tahap2.md`):
derek tetap derek putar klasik (A1 di ruang pamer), pemilik menyukai
nuansanya; derek portal per dok dibatalkan. Mockup ini untuk melihat, bukan
untuk membatalkan keputusan itu: bentuk dereknya tetap derek putar klasik.

Dok sekarang sudah rapat: jumlahnya mengikuti `max_parallel` (sampai enam
dalam satu baris, tujuh sampai sepuluh dalam dua baris), dan tempat berdiri
tukang di samping dok depan hanya berjarak 0,1 dari sapuan lambung terlebar di
baris belakang. Ruang pamer ada di `docs/mockups/galangan/` dan dibuka dengan
server berkas statis dari akar repo.

## Request

Sebuah halaman mockup di ruang pamer yang memperlihatkan derek putar klasik
berdiri di tiap dok dan bekerja membantu pembangunan kapal, dalam beberapa
pilihan penempatan, dengan ukuran dan jarak dok yang sama dengan galangan
yang sebenarnya, supaya pemilik bisa menilai apakah ruang kapal menjadi
sempit dan memilih penempatannya.

## Done when

- [x] Ada halaman mockup baru di ruang pamer, bisa dibuka dari halaman utama ruang pamer, yang memperlihatkan dok dengan derek putar klasik di tiap dok; ukuran dok, jarak antar-dok, dan susunan dua barisnya sama dengan galangan yang sebenarnya.
- [x] Sedikitnya tiga pilihan penempatan derek bisa dibandingkan, masing-masing diberi kode seperti benda lain di ruang pamer; salah satunya satu derek yang dibagi dua dok bersebelahan.
- [x] Tiap pilihan bisa dilihat dengan 4, 6, dan 10 dok.
- [x] Tiap dok memuat kapal ukuran terbesar dan tukang di tempat berdirinya, dan tiap pilihan menyebut dalam angka jarak bebas terkecil antara derek, kapal, tukang, dan landasan dok tetangga; pilihan yang saling bersinggungan ditandai jelas.
- [x] Derek terlihat bekerja: lengannya mengayun membawa muatan ke lambung berulang-ulang, tanpa menembus kapal, tukang, atau derek tetangga.
- [x] Kamera bisa diputar dan di-zoom seperti di ruang pamer lainnya.
- [x] Galangan yang sebenarnya (halaman Shipyard di viewer) tidak berubah.
- [ ] (owner) Pemilik bisa membandingkan pilihan-pilihan itu dan menilai apakah ruang kapal menjadi sempit.

## Out of scope

Memasang derek per dok di galangan yang sebenarnya, dan memutuskan apa yang
terjadi pada derek tunggal di dekat mercusuar serta Crane operator: keduanya
menunggu pilihan pemilik sesudah melihat mockup ini.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [unseen] Tiga dari lima pilihan (F3, F4, F5) memakai derek A1 dengan tapak dikecilkan dari 2,4 menjadi 0,9; tiang, lengan, dan warnanya tetap A1.
  Why: Dengan tapak asli 2,4 derek tidak muat di dok mana pun tanpa menginjak tempat berdiri tukang (F1 dan F2 memperlihatkan itu); tanpa pilihan bertapak kecil pemilik tidak punya penempatan yang muat untuk dibandingkan.
  If wrong: Hapus F3–F5 dari OPTIONS di docs/mockups/galangan/derek-plan.js, atau ubah SLIM menjadi ukuran tapak yang diinginkan.
- A2 [unseen] Kait derek di mockup bisa bergeser sepanjang lengan dan muatannya tidak ikut berputar; derek di galangan sekarang kaitnya tetap di ujung lengan.
  Why: Dengan kait tetap di jarak 5 derek hanya bisa menaruh muatan pada satu lingkaran, dan dari samping dok lingkaran itu tidak jatuh di lambung.
  If wrong: Ubah REACH di derek-plan.js menjadi [5, 5]; titik ambil dan taruh perlu dipindah ke lingkaran itu.
- A3 [unseen] Jarak bebas dihitung dengan tukang sebagai lingkaran berjari-jari 0,5 di tiap tempat berdirinya, dan 'rapat' berarti lebih sempit dari 0,1 (jarak tersempit galangan sekarang). Palet bahan tidak dihitung, derek tunggal dekat mercusuar tidak digambar, jalan tukang dan perancah ikut dihitung selain empat hal yang diminta.
  Why: Tiket meminta angka tetapi tidak menyebut ukuran badan tukang atau batas rapat; 0,5 adalah kepala model tukang pada skala galangan.
  If wrong: Ubah BODY dan TIGHT di derek-plan.js.
- A4 [unseen] Kapal diperlihatkan pada tahap lambung berdiri tanpa tiang; ada tombol 'tiang berdiri' yang memperlihatkan kapal selesai, dan di situ semua derek berhenti menghadap laut.
  Why: Tiang kapal terbesar (9,0) lebih tinggi dari lengan derek (7,6): lengan tidak bisa mengayun di atas kapal yang tiangnya sudah berdiri tanpa menembusnya.
  If wrong: Hapus tombol tahap di derek.html dan cabang masts di derek.js.

## Decisions
- Derek bertetangga bekerja selisih setengah putaran: pada 6 dok jarak antar-derek (7,8) lebih pendek dari lengan ditambah pemberat (8,7), sehingga dua lengan yang sama-sama menunjuk sepanjang baris akan bertabrakan.

## Manual checks
- M1 [waiting] (item 8) 1. Di akar repo: python3 -m http.server 4400 --bind 127.0.0.1
  2. Buka http://127.0.0.1:4400/docs/mockups/galangan/ lalu klik 'F · Derek di tiap dok' di baris atas.
  3. Klik F1 sampai F5, dan untuk tiap pilihan klik 4, 6, 10 di sebelah 'Dok:'. Seret untuk memutar, roda tetikus untuk zoom.
  4. Baca panel kanan bawah: kalimat berwarna, jarak bebas per benda, dan tabel 'Semua pilihan' (selnya bisa diklik).
  5. Klik 'tiang berdiri' untuk melihat kapal selesai.
  Yang seharusnya terlihat: derek di tiap dok mengayun membawa peti ke lambung; F1 dan F2 bersilang merah di semua jumlah dok, F4 hijau di 4, 6, dan 10 dok, F5 hijau di 4 dok.

## Handoff
Ruang pamer mendapat halaman baru, docs/mockups/galangan/derek.html (tombol F di index.html): derek putar A1 di tiap dok dalam lima penempatan F1–F5, dengan 4, 6, atau 10 dok, jarak bebas dalam angka, dan tanda merah bila bersinggungan. derek-plan.js murni (tanpa three.js) dan memegang letak derek, jarak bebas, serta gerak lengan; derek.js hanya menggambar. Yang tidak boleh rusak: letak dok selalu dari yardOf dan footprints di viewer/web/space/plan.js, tidak disalin; tidak ada berkas di viewer/ yang diubah; uji 'mockup of a crane' menahan bahwa lengan dan muatan tidak pernah menyentuh apa pun. Keputusan 34 tidak diubah.

## Review
- 2026-11-14 standard, round 1, at 09e67c7: passed.
  1: Chromium tanpa layar: dari index.html tombol F membuka derek.html, tanpa galat konsol, tiap dok berderek. Uji 'mockup of a crane' lulus di salinan: dok = yardOf(n) untuk 4/6/10; 10 dok dua baris. Ukuran slipAt dibandingkan dengan world.js: sama.
  2: Tombol F1–F5 ada di halaman; F2 dan F5 derek bersama (4 dok: 2 derek, 6: 3, 10: 5), dibaca dari halaman pada kelima belas gabungan; sel tabel 'Semua pilihan' bisa diklik (F5/10).
  3: Kelima belas gabungan pilihan × 4/6/10 diklik: halaman melaporkan 4, 6, 10 dok, tanpa galat.
  4: Tangkapan layar: kapal terbesar dan delapan tukang per dok. Panel memberi angka ke kapal, tukang, landasan tetangga, perancah, jalan, derek lain, sama dengan clearances() di halaman. F1, F2, F3/10, F5/10 merah bersilang; F3/4, F3/6, F5/6 kuning; F4 hijau.
  5: Lengan dipantau 16 detik: mengayun 3,14→5,61→3,14, peti terbawa lalu dilepas, berulang. swing() dijalankan di halaman dengan lambung terukur, langkah 0,05, 15 gabungan: lengan ke derek lain min 1,24, muatan min 0,07; tahap tiang: lengan ke tiang min 0,46.
  6: Seret tetikus memutar kamera (posisi berubah, jarak tetap 118); roda mendekatkan (118→86,7).
  7: git diff main...HEAD -- viewer dan git diff main HEAD -- viewer: 0 baris.
  8: (owner) M1 bisa diikuti dari awal dan menyebut yang terlihat; langkahnya saya jalani di peramban tanpa layar dan cocok.
  note: Lambung di uji adalah kotak buatan (11,5); yang terukur di halaman 12,0. Kriteria 5 dibuktikan dengan lambung terukur. Di F1/F2 yang bersinggungan tapak derek, bukan lengan atau muatan. Repo tidak punya skrip/CI lain untuk mockup.
