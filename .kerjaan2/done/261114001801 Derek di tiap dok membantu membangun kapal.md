---
type: feature
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-14 00:18
---

## Background

Di galangan 0.18.0 hanya ada satu derek putar besar di ujung timur dekat
mercusuar. Ia hanya mengayunkan lengannya saat Crane operator datang, tidak
mengangkat apa pun, dan tidak ikut membangun kapal. Pemilik mengira derek
berdiri di tiap dok dan membantu pembangunan, lalu meminta mockup lebih dulu
(tiket 261113234801, halaman `docs/mockups/galangan/derek.html`).

Keputusan pemilik sesudah melihat mockup itu (14 November 2026):

- **Penempatan F4:** derek putar klasik dengan kaki yang dikecilkan (dari 2,4
  menjadi 0,9), berdiri di sudut kepala dok masing-masing. Hanya ini yang
  muat pada 4, 6, dan 10 dok (jarak bebas terkecil 0,15).
- **Kapan bekerja:** selama worker tiket itu bekerja, derek mengayun muatan
  pelan-pelan ke lambung; tiap kali satu kriteria terpenuhi, derek mengantar
  satu potong dengan jelas, baru lambung naik. Diam saat tidak ada agen;
  parkir saat kapal lulus.
- **Derek besar dihapus.** Crane operator tetap ada dan berdiri di dekat kapal
  yang mendapat giliran merge, tanpa derek sendiri.

Yang diketahui dari mockup: tiang kapal jadi (9,0) lebih tinggi dari lengan
derek (7,6), jadi derek tidak boleh mengayun di atas kapal yang layarnya
sudah dipasang. Bentuk dereknya tetap derek putar klasik (keputusan 34).

## Request

Tiap dok di galangan punya derek putar klasik sendiri di sudut kepala doknya,
yang terlihat membantu membangun kapal di dok itu selama worker-nya bekerja,
dan parkir begitu kapal lulus. Derek besar di dekat mercusuar tidak ada lagi.

## Done when

- [x] Tiap dok punya satu derek putar klasik berkaki sempit di sudut kepala doknya, seperti pilihan F4 di mockup, pada semua jumlah dok dari 1 sampai 10; derek, kapal terbesar, tukang, dan landasan dok tetangga tidak saling bersinggungan.
- [x] Selama worker sebuah tiket bekerja dan kapalnya belum lulus, derek dok itu mengayun muatan ke lambung; derek diam bila tidak ada agen yang bekerja pada tiket itu, dan di dok yang kosong.
- [x] Tiap kali satu kriteria terpenuhi, derek mengantar satu potong ke lambung dengan jelas, dan baru sesudah itu lambung naik.
- [x] Begitu kapal lulus dan layarnya dipasang, derek parkir menjauh dari tiang dan tetap parkir sampai kapal itu meluncur; lengan dan muatannya tidak pernah menembus kapal, tiang, tukang, atau derek tetangga.
- [x] Derek besar di dekat mercusuar tidak ada lagi. Crane operator tetap ada di daftar pemeran, berdiri di dekat kapal yang mendapat giliran merge, dan pekerjaan kecilnya tidak lagi menyebut derek besar.
- [x] Bila jumlah dok berubah selagi halaman terbuka, derek ikut menyesuaikan bersama doknya.
- [x] Mode `?demo` memperlihatkan derek bekerja, mengantar potongan, dan parkir. `docs/galangan-padanan.md` diperbarui, dan ketiga keputusan pemilik di atas tercatat di `docs/galangan-tahap2.md`.
- [x] (owner) Derek di tiap dok enak ditonton dan tidak membuat dok terasa sempit pada 4, 6, dan 10 dok, di layar lebar dan di HP.

## Out of scope

Kapal tunda, menara, malam, dan peran baru untuk Crane operator selain
berdiri di dekat kapal yang mendapat giliran merge (belum diputuskan
pemilik). Bentuk derek selain derek putar klasik.

<!-- k2:record — written by k2 only; do not edit by hand -->

## Assumptions
- A1 [confirmed] Derek mengambil bahan dari tumpukan peti di atas perancah dok itu sendiri dan hanya berputar sekitar 22 derajat (dari arah laut ke buritan kapalnya), bukan mengayun penuh dari tepi jalan seperti di mockup F4. Tempat berdiri derek tetap persis F4.
  Why: Diukur dengan model kapal asli: ayunan penuh dari tepi jalan membuat pemberat lewat di atas kapal tetangga yang layarnya sudah terpasang pada 5 dan 6 dok, dan ujung lengan mengenai tiang utama kapalnya sendiri; tiket melarang lengan menembus apa pun.
  If wrong: Ubah STACK, HULL, dan SWAY di viewer/web/space/crane.js (titik ambil dan sudut putar); uji 'no arm, cable or piece' akan menunjukkan apa yang tersentuh.
  Confirmed by owner, 2026-11-14
- A2 [confirmed] Worker yang macet (stuck) dihitung tidak bekerja: derek dok itu diam, sama seperti tukangnya yang berhenti memalu.
  Why: Tiket meminta derek diam bila tidak ada agen yang bekerja; agen macet tidak terlihat bekerja di galangan.
  If wrong: Di craneGoal (viewer/web/space/plan.js) anggap worker 'stuck' sebagai bekerja.
  Confirmed by owner, 2026-11-14
- A3 [confirmed] Saat menunggu kriteria berikutnya derek membawa satu potong ke atas lambung, menahannya, lalu membawanya kembali ke tumpukan dan mengulang; potongan hanya ditinggal di lambung saat kriteria terpenuhi.
  Why: Supaya ayunan biasa dan pengantaran potongan terlihat berbeda, dan lambung tidak tampak diisi tanpa kriteria.
  If wrong: Ubah cabang 'work' di Crane.plan (viewer/web/space/crane.js).
  Confirmed by owner, 2026-11-14

## Decisions
- Derek dibatasi berputar dari arah laut sampai buritan kapalnya sendiri dan mengambil bahan dari atas perancah: dengan begitu tidak perlu aturan giliran antarderek, dan tidak ada lengan atau pemberat yang lewat di atas kapal lain. Tinggi geladak tempat potongan diletakkan (DECK) diukur dari model kapal dan dijaga uji.

## Manual checks
- M1 [ok] (item 8) 1. Sesudah tiket ini masuk main: /plugin update kerjaan2, buka sesi baru, jalankan k2 view, buka halaman Shipyard sebuah papan, klik Demo.
  2. Tonton sekitar dua menit pada 4 dok: derek di dok yang tukangnya bekerja mengayun peti ke lambung; saat lambung naik, tepat sebelumnya derek menurunkan satu peti ke dalamnya; derek di samping kapal berlayar menghadap laut dan diam.
  3. Klik tautan Slips 6 lalu 10 di catatan demo dan ulangi.
  4. Ulangi di HP (atau jendela sempit). Yang seharusnya terlihat: tiap dok punya satu derek kuning di sudut belakang kanannya, dok tidak terasa sempit, dan tidak ada lengan atau peti yang menembus kapal, layar, atau orang.
  Checked by owner, 2026-11-14

## Handoff
Tiap dok kini punya derek sendiri (viewer/web/space/crane.js: tempat, gerak, mesin keadaan work/hold/park, murni tanpa three). plan.js: yardOf memberi cranes, craneGoal menentukan tujuan dari gambaran tiket. world.js menggambar derek di slipAt dan menyimpan world.cranes per indeks dok lintas setDocks; derek besar dan stations.crane hilang (gantinya stations.mooring). director.js: check menunggu crane.deliver sebelum lambung naik (tok.wait), layar hanya dipasang bila derek parkir, launch menunggu parkir. Jangan dirusak: derek hanya berputar antara 0 dan -0,38 rad; layar tidak boleh tampil selagi derek belum parkir; janji deliver dan whenParked harus selalu selesai (cancel, retire).

## Review
- 2026-11-14 standard, round 1, at d528864: passed.
  1: Uji 'every slip has a slewing crane…' dan 'no arm, cable or piece…' lulus (1-10 dok, enam model kapal). world.js asli dijalankan di Node pada salinan: setDocks 1-10 menggambar tepat n derek di tempat yardOf. Mutasi (derek digeser ke x+3,6) membuat uji gagal.
  2: Uji 'the crane of a slip works while the ticket's worker does…' lulus; mutasi craneGoal (bekerja juga saat macet atau review) membuatnya gagal. Di dok kosong dan dok tanpa worker pose derek tidak berubah.
  3: Uji 'a criterion met…' lulus: lambung tetap sampai potongan diletakkan, baru naik; dua check dua potong; uncheck dan void tanpa derek. Mutasi hoist yang tidak mengantar membuat uji ini dan uji demo gagal.
  4: Uji 'a hull that passed…' dan 'no arm, cable or piece…' lulus. Tiga mutasi (layar tanpa menunggu parkir, peluncuran tanpa menunggu parkir, lengan berputar sampai -0,7 rad) masing-masing membuat uji gagal.
  5: Uji 'the crane operator has no crane…' lulus; di world.js asli yang dijalankan api.crane dan stations.crane tidak ada, stations.mooring ada, dan semua tiang derek milik dok. Pekerjaan kecilnya: coiling rope, looking over the launch ramps, fetching rope.
  6: Uji 'the slips change…' lulus, tetapi setDocks di sana milik panggung uji. Maka world.js asli dijalankan pada salinan: 4 ke 8 ke 2 dok, derek dok 2 tetap benda yang sama dengan posenya; jumlah derek tergambar selalu sama dengan jumlah dok, sampai 10, tanpa galat.
  7: Uji 'the demo shows the cranes at work…' lulus (startDemo, Director dan Crane asli: bekerja, tiga potong, parkir di samping layar, diam). Padanan punya bagian 'Derek di tiap dok'; keputusan 36, 37, 38 ada di galangan-tahap2.md (grep).
  8: (owner) M1 bisa diikuti dari awal dan berakhir pada apa yang harus terlihat. Tidak dinilai di sini.
  note: Hanya dibaca: tampilan di peramban (WebGL, model asli di layar); ukuran lengan di world.js sama dengan ARM di crane.js. Repo tidak punya pemeriksaan lain selain perintah uji.
  note: version di plugin.json masih 0.18.0; langkah 1 M1 (/plugin update) baru memperlihatkan derek sesudah rilis menaikkan versi. Urusan rilis, bukan tiket ini.
  note: k2 test menjalankan perintah lewat shell tanpa kutip: --test-name-pattern berisi spasi atau | pecah menjadi perintah lain. Pakai pola tanpa spasi.
- 2026-11-14 conflict resolution, at a2f0ab6: passed.
  Gabungan a2f0ab6 menjaga keduanya dan tidak menambah apa pun: perahu pesanan (keputusan 36-38, BOATS/BUOY/courseOf, tanpa kapal tunda hiasan) utuh dari main; derek tiap dok utuh, keputusannya dinomori ulang 39-41 di kedua dokumen. 23 uji derek dan perahu lulus pada hasil gabungan.
