# Galangan tahap 2: animasi yang mengikuti linimasa

Ditulis 13 November 2026 untuk sesi baru yang tidak punya ingatan apa pun.
Baca dulu `CLAUDE.md`, bagian "Galangan" di akhir `docs/blueprint.md`, dan
`docs/galangan-padanan.md` (padanan yang berlaku di 0.16.0). Berkas ini memuat
apa yang diminta pemilik untuk tahap berikutnya dan apa yang sudah diputuskan.

## Cara kerja

Pemilik memutuskan tahap ini **dikerjakan lewat papan kerjaan2 milik repo ini
sendiri** ("jeruk makan jeruk"). Pemilik juga meminta diajak mengobrol dengan
ekspresif dan memakai emoji saat membahas ide. Yang perlu terjadi lebih dulu, dan hanya bisa
dilakukan pemilik:

1. `/plugin install kerjaan2@kerjaan2` di repo ini, lalu buka sesi baru.
2. Di sesi baru: `k2 init`, lalu kalimat "kerjaan2 has no board of its own
   yet" di `CLAUDE.md` diganti.
3. Mandor membuat tiket dari berkas ini (usul pemecahan ada di bawah).

Hal yang perlu diingat saat memakai kerjaan2 untuk mengerjakan kerjaan2:
plugin yang berjalan adalah salinan di cache (versi terpasang), sedangkan yang
diubah adalah sumbernya di repo ini. Perubahan baru berlaku setelah
`/plugin update kerjaan2` dan sesi baru.

## Keputusan pemilik (13 November 2026)

24. **Galangan memutar linimasa tiket**, bukan membandingkan keadaan papan.
    Tiap kejadian di `log/<id>.jsonl` menjadi satu adegan, diputar berurutan
    dengan jam galangan sendiri yang boleh tertinggal dari papan ("delay
    tolerance"). Bila tertinggal terlalu jauh, adegan dipercepat. Saat halaman
    baru dibuka, galangan mulai dari keadaan sekarang, tidak memutar sejarah.
25. **Tiket masuk backlog:** satu perahu kecil datang dari ujung laut membawa
    satu rombongan tiket (beberapa tiket yang dibuat berdekatan), berlabuh di
    dermaga, lalu pergi ke sisi lain dan menghilang. Courier hanya ke dermaga
    bila ada perahu yang menepi; ia menaruh semua tiket itu di papan pesanan.
    Tiket yang lahir sesudah tiket lain selesai (usulan mandor) datang dengan
    cara yang sama.
26. **Tiket masuk todo:** satu karakter perencana (usul nama: Naval Architect,
    menggantikan Draughtsman) mendatangi papan pesanan dan membaca tiket-tiket
    selama planner bekerja. Bila planner bertanya, ia memakai simbol `?`.
    Setelah terjawab, ia memindahkan tiket-tiket itu ke wadah todo: meja
    panjang dengan tiket berjejer. Tiket yang harus menunggu tiket lain
    diletakkan di baris belakang.
27. **Tiket masuk in_progress:** tiap tukang berjalan ke meja todo, mengambil
    satu tiket, dan kembali ke doknya untuk mulai membangun.
28. **Jumlah dok mengikuti `max_parallel`**: sampai 6 dalam satu baris, 7–10
    dalam dua baris. Bukan paging, bukan pulau terpisah.
29. **Review:** tukang yang selesai meloncat senang (🥳). Inspector datang dan
    mengelilingi kapal. Lulus: ia mendekati tukang, bicara singkat, tukang
    senang. Ditolak: Inspector memberi ❌, tukang sedih dan kembali bekerja.
30. **Lulus belum berarti meluncur.** Lulus = layar dipasang dan perayaan;
    kapal baru meluncur saat `landed`. Bila ditahan (held, stopped), kapal
    menunggu dengan jangkar turun.
31. **Cancel tidak diberi cerita:** tokennya menghilang pelan.
32. **Sepuluh macam kapal** yang berbeda bentuk dan warna. Paket Kenney punya
    enam bentuk lambung (tiga ukuran × biasa dan bajak laut); sisanya dari
    warna layar dan bendera. Tiap tiket selalu mendapat kapal yang sama
    (ditentukan dari ID-nya).
33. Trik "lambung merayap naik selama agen bekerja" dibuang: lambung bertambah
    hanya pada kejadian `check`.

34. **Derek tetap derek putar yang sekarang** (model A1 di ruang pamer).
    Pemilik menyukai nuansa klasiknya. Derek portal per dok dibatalkan.
35. **Fokus tahap ini adalah alurnya** (keputusan 24–33). Pilihan bentuk lain
    (derek, karakter, kapal, komponen) ditunda; semua calonnya disimpan di
    ruang pamer.

## Ruang pamer

`docs/mockups/galangan/` berisi semua calon bentuk, tiap benda dengan kode:
A1–A5 derek putar klasik, B1–B20 karakter (B1–B10 sudah dipakai), C1–C10
kapal, D1–D12 komponen kapal (tahap bangun, warna lambung, bentuk lain),
E1–E10 komponen lain (perahu pesanan, meja todo, papan pesanan, kapal tunda,
menara, jangkar, merpati, perancah, lonceng). Buka dengan
`python3 -m http.server 4400 --bind 127.0.0.1` dari akar repo, lalu
`http://127.0.0.1:4400/docs/mockups/galangan/`. Model cadangannya ada di
`docs/mockups/galangan/kits/` dan belum menjadi bagian viewer; yang dipakai
viewer harus disalin ke `viewer/web/space/kits/` (uji menolak model yang ada
tetapi tidak dimuat).

Yang sudah bisa diambil dari ruang pamer untuk alur: sepuluh kapal C1–C10
(keputusan 32) dibuat dengan mewarnai layar dan bendera lewat bahan terpisah
(lihat `makeShip` di `docs/mockups/galangan/mock.js`), balon emoji digambar di
kanvas, dan gerakan `jump` tersedia di semua karakter.

## Belum diputuskan pemilik (usul agen)

- **Peran derek putar.** Belum punya peran dalam alur. Usul: ia mengangkat
  tiang dan layar ke kapal saat lulus, atau tetap menjadi tanda antrean merge.
- **Kapal tunda.** Crane operator menjadi juru mudi kapal tunda: antrean merge
  adalah antrean tunda, `landed` berarti kapal ditarik dari landasan ke tempat
  berlabuh, `integrate` (main dibawa masuk) berarti kapal tunda mengantar
  muatan ke kapal itu dulu.
- **Menara.** Menara adalah saluran ke pemilik, yang tinggal di negeri
  seberang (tempat perahu pesanan datang). Lampu putih tenang bila tidak ada
  yang menunggu, kuning bila ada, merah cepat bila ada pertanyaan yang
  menahan atau agen macet. Bendera berwarna per jenis butir kotak masuk.
  Jawaban pemilik (`answer`) datang sebagai merpati dari menara ke dok.
  Keeper membunyikan lonceng saat perahu pesanan terlihat, dan itulah yang
  memanggil Courier.
- **Malam.** Papan yang lama tidak bergerak membuat hari menjadi senja dan
  lampu-lampu menyala.
- **Putar ulang.** Tombol di kartu tiket untuk memutar ulang hidup satu tiket.
  **Diputuskan pemilik 13 November 2026: tidak perlu.** Pemutar linimasa
  adalah mesin di belakang layar, tanpa kendali di halaman.
- **Pilihan bentuk** dari ruang pamer: karakter untuk si perencana, kapal
  mana yang masuk, perahu pesanan E1 atau E2, kapal tunda.

## Pemetaan linimasa ke adegan (usul awal)

Kejadian yang ditulis `core/` ada di `viewer/web/trail.js`.

| Kejadian | Adegan |
|---|---|
| `created` | perahu pesanan, Courier, papan pesanan |
| `question`, `answer` | `?` pada perencana atau tukang; jawaban datang |
| `moved` ke todo | perencana memindahkan tiket ke meja todo |
| `started` | dok disiapkan untuk tiket itu |
| `agent` (worker) | tukang mengambil tiket dari meja, mulai membangun |
| `check`, `uncheck`, `void` | lambung bertambah atau berkurang |
| `test` | lampu dok hijau atau merah sesaat |
| `submitted` | tukang meloncat senang |
| `agent` (reviewer) | Inspector mengelilingi kapal |
| `verdict` | lulus: layar dipasang; ditolak: ❌ dan tukang kembali bekerja |
| `integrate`, `integrated`, `conflict` | main dibawa masuk sebelum merge |
| `held` | jangkar turun |
| `landed` | kapal meluncur dan berlabuh |
| `released`, `retry` | tukang meninggalkan atau kembali ke dok |
| `assumption*`, `manual*`, `accepted`, `amended` | isyarat di menara |
| `moved` ke cancel | token menghilang |

Yang tidak ada di linimasa dan tetap dibaca dari keadaan: langkah terakhir
agen (transkrip), uji yang sedang berjalan, agen macet.

## Yang perlu diubah di luar `viewer/web/space/`

- **Planner tidak tercatat di papan.** `core/cmd-hook.mjs` sudah mengenali
  pengiriman planner tetapi tidak menulisnya. Perlu catatan tingkat papan
  (planner tidak terikat satu tiket), dan viewer membacanya. Baru terbukti di
  sesi kerjaan2 sungguhan.
- **Linimasa per tiket lewat API.** `/api/p/<proyek>/state` hanya memberi
  kejadian terakhir (`last`). Perlu jalan hanya-baca untuk kejadian sejak
  suatu titik, bagi tiket yang belum selesai.
- `director.js` dirombak dari "bandingkan keadaan" menjadi "antrean adegan per
  tiket". Uji di Node dengan galangan dan pemeran tiruan sudah ada
  (`tests/viewer.test.mjs`, `stagedYard`) dan menjadi dasar uji barunya.

## Usul pemecahan tiket

1. Jalan API untuk linimasa per tiket (hanya-baca), dengan uji.
2. Pemutar linimasa: antrean adegan per tiket, jam galangan, percepatan.
3. Perahu rombongan dan Courier yang hanya datang saat perahu menepi.
4. Catatan planner di inti dan hook; perencana membaca papan; meja todo
   dengan baris menunggu.
5. Tukang menjemput tiketnya; dok mengikuti `max_parallel`.
6. Drama review, lulus tanpa meluncur, jangkar saat ditahan.
7. Sepuluh macam kapal.
8. Peran derek putar, kapal tunda, menara (setelah diputuskan pemilik).

Tiket 2 bergantung pada 1; tiket 3–6 bergantung pada 2; tiket 7 berdiri
sendiri. Banyak kriterianya soal rupa, jadi akan berupa cek tangan pemilik.
Mode `?demo` perlu ikut menghasilkan linimasa supaya adegan bisa ditonton
tanpa sesi sungguhan.
