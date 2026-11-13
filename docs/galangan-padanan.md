# Galangan: padanan viewer kanban ke ruang 3D

Ditulis 13 November 2026, untuk versi 0.16.0; sepuluh macam kapal, pemutar
linimasa, perahu rombongan, perencana (Naval Architect) dan meja todo,
tukang yang menjemput tiketnya dan dok yang mengikuti `max_parallel`, lalu
drama review (dengan jangkar saat ditahan), dan derek di tiap dok
ditambahkan sesudahnya. Berkas ini mendaftar apa yang
terjadi di viewer kanban (`k2 view`) dan apa padanannya di halaman galangan
(`/p/<proyek>/space`), serta apa yang belum punya padanan. Keputusan dan batas
galangan ada di bagian "Galangan" pada akhir `docs/blueprint.md`.

Sumber kebenaran padanan ini adalah kode: `viewer/web/space/plan.js` (arti
papan dan arti tiap kejadian linimasa), `director.js` (pemutar adegan), dan
`cast.js` (tugas tiap pemeran), dan `crane.js` (derek tiap dok).
Bila kode berubah, berkas ini ikut diperbarui.

## Catatan saat membaca galangan

- Bila papan tidak punya tiket yang berjalan, semua karakter hanya mengerjakan
  pekerjaan kecil pengisi waktu (menyapu dok, menata rak, menggulung tali).
  Derek di tiap dok diam, lengannya menghadap laut.
  Pekerjaan itu sengaja tidak menyebut tiket apa pun. Hubungan dengan papan
  baru terlihat saat ada tiket yang bergerak, atau di mode `?demo`.
- Galangan boleh tertinggal dari papan, tidak pernah mendahuluinya.
- Saat halaman baru dibuka, tiap tiket langsung diletakkan di tempatnya tanpa
  cerita. Cerita (karakter membawa sesuatu) hanya untuk kejadian yang terjadi
  selagi halaman terbuka.

## Linimasa: cara galangan mengikuti papan

Galangan tidak lagi membandingkan keadaan papan dari satu pembacaan ke
pembacaan berikutnya. Ia memutar linimasa tiap tiket (`log/<id>.jsonl`, lewat
`/api/p/<proyek>/timeline`): tiap kejadian satu adegan, berurutan per tiket.
Adegan berikutnya pada tiket yang sama baru mulai setelah adegan sebelumnya
selesai, jadi dua kejadian yang berdekatan (kriteria terpenuhi lalu tiket
diserahkan) keduanya diputar. Tiket yang berbeda berjalan bersamaan.

Untuk tiap tiket galangan menyimpan apa yang sudah ia perlihatkan: status,
kriteria mana yang terpenuhi atau dibatalkan, lulus atau belum, berapa kali
ditolak. Catatan itu hanya berubah ketika kejadiannya diputar. Karena itu
perubahan di papan tidak tampil sebelum adegannya tiba, dan tidak ada yang
tampil sebelum terjadi di papan.

**Jam galangan dan batas tertinggal.** Galangan dianggap tertinggal sejauh
umur kejadian tertua yang adegannya belum selesai.

| Tertinggal | Yang terjadi |
|---|---|
| sampai 30 detik | adegan diputar dengan kecepatan biasa |
| lebih dari 30 detik | adegan dipercepat: tertinggal dibagi 30 detik, paling banyak 4 kali (60 detik menjadi 2 kali, 120 detik ke atas menjadi 4 kali), sampai terkejar |
| lebih dari 5 menit | cerita dilepas: semua tiket langsung diletakkan di keadaan papan sekarang, seperti halaman yang baru dibuka |

Yang dipercepat hanya adegan (orang yang sedang membawa tiket, kapal yang
meluncur, lambung yang naik atau turun); pekerjaan pengisi waktu, laut, dan
kapal tunda tetap pada kecepatannya. Angkanya ada di `plan.js` (`CALM`,
`FAST`, `LATE`, `paceOf`).

**Kejadian dan adegannya.**

| Kejadian | Adegan |
|---|---|
| `created` | Perahu rombongan; Courier membawa peti ke rak ORDERS (lihat "Perahu rombongan") |
| `moved` ke todo | Naval Architect mengambil tiket dari papan pesanan dan menjejerkannya di meja todo; tiket yang pindah hampir bersamaan dibawa dalam satu jalan |
| `started` | Dok kosong disiapkan untuk tiket itu: papan namanya dipasang, Foreman datang menyapa tukang dok itu. Gulungan tetap di meja todo; belum ada lambung |
| `agent` (worker) | Tukang dok itu berjalan ke meja todo, mengambil gulungannya, membawanya ke doknya; sesudah ia tiba lunas diletakkan. Hanya sekali per tiket: worker kedua (setelah ditolak) tidak menjemput lagi |
| `check` | Derek dok itu mengantar satu potong ke lambung; sesudah potongan itu diletakkan, lambung naik (lihat "Derek di tiap dok") |
| `uncheck`, `void` | Lambung turun atau naik, tanpa derek |
| `submitted` | Shipwright dok itu meloncat senang (🥳). Di jalur light, yang lulus tanpa reviewer: layar langsung dipasang, tanpa Inspector |
| `verdict` lulus | Inspector mendatangi Shipwright, bicara singkat (💬 lalu "✓"); layar dan bendera dipasang; Shipwright meloncat senang (😄). Kapal tetap di doknya |
| `verdict` ditolak | Inspector memberi ❌; Shipwright sedih (😢) lalu kembali bekerja; kriteria yang disebut gagal dicabut, lambung turun |
| `accepted` (`k2 accept` sesudah ditolak) | Seperti lulus di jalur light: Shipwright meloncat senang, layar dipasang, tanpa Inspector |
| `submitted` dan `verdict` selagi main dibawa masuk sesudah lulus | Tanpa adegan; layar tetap terpasang |
| `landed` | Kapal meluncur dan berlabuh. Hanya kejadian ini yang meluncurkan kapal |
| `moved` ke cancel | Tanpa cerita: tokennya (gulungan atau kapal) memudar pelan, sekitar 2 detik, di tempatnya lalu hilang. Tak ada pemeran yang berjalan; dok atau slot yang ditinggalkan langsung bisa dipakai. Tiket yang sudah cancel saat halaman dibuka tidak tampil |
| `moved` mundur (misalnya todo ke backlog, atau dibuka lagi) | Langsung diletakkan, tanpa cerita |
| `agent` (reviewer), `test`, `question`, `answer`, `assumption*`, `manual*`, `integrate`, `integrated`, `conflict`, `held`, `amended`, `released`, `retry` | Belum punya adegan: dilewati |

**Yang tetap dibaca dari keadaan papan**, karena tidak ada di linimasa:
langkah terakhir agen, uji yang sedang berjalan (lampu dok), agen macet,
reviewer yang sedang bekerja (Inspector berkeliling), ditahan atau dihentikan
(jangkar), pertanyaan yang menunggu pemilik, bendera kotak masuk, urutan
antrean, giliran merge, planner yang sedang bekerja, baris tiket di meja
todo (siap atau menunggu tiket lain), dan worker yang sedang bekerja (derek
dok itu mengayun muatan). Semua itu tampil seketika.

**Sambungan putus.** Halaman mengingat sampai titik mana linimasa sudah
dibaca. Pembacaan yang gagal tidak menggeser titik itu, jadi setelah tersambung
lagi semua kejadian sejak titik itu datang satu kali: tidak ada adegan yang
hilang, tidak ada yang terulang.

Batas-batasnya:

- Titik baca hanya hidup di ingatan server dan berlaku 10 menit. Bila viewer
  (`k2 view`) dinyalakan ulang, atau halaman terputus lebih dari 10 menit,
  server tidak mengenali titiknya: galangan langsung diletakkan di keadaan
  sekarang tanpa cerita, lalu memutar lagi dari situ.
- Tab yang disembunyikan tidak menggambar, jadi adegan berhenti sementara
  kejadian terus menumpuk. Saat tab dibuka lagi berlaku tabel di atas.
- Bila galangan dan papan berbeda tanpa ada kejadian yang menjelaskannya
  (berkas tiket diubah dengan tangan, kontrak diubah, kejadian yang belum
  dikenal galangan), tiket itu diletakkan sesuai papan tanpa cerita pada
  pembacaan kedua. Satu pembacaan saja belum cukup, sebab papan bisa terbaca
  tepat di antara berkas yang pindah dan kejadiannya yang ditulis.
- Tiket yang muncul di papan tanpa kejadian `created` (berkas ditaruh dengan
  tangan) diletakkan di tempatnya dengan cara yang sama, tanpa perahu.
- Mode `?demo` mengarang linimasanya sendiri dalam bentuk yang sama dengan
  jawaban server, jadi demo diputar oleh mesin yang sama dengan papan
  sungguhan: satu tiket bisa ditonton dari pesanan sampai berlabuh.

## Perahu rombongan

Tiket baru (kejadian `created`) datang dengan perahu kecil, serombongan.

- **Satu rombongan** adalah tiket-tiket yang dibuat berdekatan: tiap tiket
  dibuat paling lama **60 detik** sesudah tiket sebelumnya di rombongan itu,
  selagi perahunya belum pergi dari dermaga. Yang dihitung adalah waktu tiket
  dibuat di papan, bukan waktu adegannya diputar. Angkanya `GROUP` di
  `plan.js`, aturannya `joins`.
- Perahu berangkat begitu tiket pertama terlihat; galangan tidak menunggu
  rombongannya lengkap. Tiket yang dibuat selagi perahu masih di jalan atau
  berlabuh ikut naik. Tiket yang dibuat lebih dari 60 detik sesudah tiket
  sebelumnya, atau sesudah perahu pergi, menunggu perahu berikutnya, yang baru
  muncul setelah perahu sebelumnya hilang dari pandangan.
- Perahu muncul dari ujung laut (tepi luar teluk), berlabuh di sisi dermaga,
  lalu pergi memutari ujung dermaga ke sisi seberangnya dan menghilang. Di
  luar itu tidak ada perahu di dermaga.
- Courier hanya berjalan ke dermaga setelah perahu berlabuh. Ia mengambil satu
  peti, berapa pun isi rombongannya; saat peti diangkat perahu pergi, dan
  rombongan itu tertutup. Semua tiket rombongan muncul di rak ORDERS pada saat
  Courier tiba di sana, tidak sebelumnya. Pekerjaan pengisi waktu Courier tidak
  lagi membawanya ke dermaga.
- Tiket usulan yang lahir sesudah tiket lain selesai memakai kejadian
  `created` yang sama, jadi datang dengan cara yang sama.
- Mode `?demo` menulis pesanan beberapa sekaligus; kiriman pertamanya, tidak
  lama setelah halaman dibuka, selalu satu rombongan berisi tiga tiket.

Batas-batasnya:

- Bentuk perahunya masih perahu dayung yang lama; bentuk baru belum dipilih.
- Courier dipanggil oleh perahu yang berlabuh, bukan oleh lonceng Keeper (belum
  diputuskan).
- Bila Courier sedang sibuk, perahu menunggu di dermaga sampai ia datang, dan
  perahu berikutnya ikut tertunda. Bila galangan tertinggal lebih dari 5
  menit, tiket langsung diletakkan di rak tanpa menunggu peti.
- Rak ORDERS memuat 12 gulungan; rombongan yang lebih besar tetap dibawa satu
  peti, sisanya tidak digambar.

## Review, lulus, dan jangkar

Review adalah adegan, dan lulus belum berarti meluncur.

- **Diserahkan** (`submitted`): Shipwright dok itu meloncat senang dengan
  balon 🥳.
- **Reviewer bekerja** (dibaca dari keadaan papan): Inspector datang ke kapal
  itu dan mengelilinginya: menyusuri satu sisi, kembali lewat jalan di belakang
  dok, lalu menyusuri sisi lainnya, berhenti memeriksa di empat titik. Selama
  reviewer masih bekerja ia mengulang putaran itu. Bila beberapa kapal sedang
  direview, ia berkeliling bergiliran.
- **Lulus** (`verdict` lulus): Shipwright menunggu di sisi dok. Inspector
  mendekatinya dan bicara singkat (💬, lalu "✓"). Saat itulah layar dan bendera
  dipasang, tidak sebelumnya; Shipwright meloncat senang (😄). Kapal tetap di
  doknya.
- **Ditolak** (`verdict` ditolak): Inspector mendekati Shipwright dan memberi
  ❌. Lambung baru turun sesudah ❌ itu, tidak selagi Inspector masih di jalan.
  Shipwright sedih (😢, menggeleng), lalu kembali memalu.
- **Lulus tanpa reviewer** (jalur light, atau `k2 accept`): Shipwright
  meloncat senang (🥳) dan layar langsung dipasang. Inspector tidak datang,
  sebab tidak ada reviewer yang bekerja.
- **Inspector hanya satu.** Tiap vonis ia antarkan sendiri, satu kapal sampai
  selesai baru kapal berikutnya, menurut urutan kejadiannya; adegan tiket lain
  menunggu gilirannya. Vonis tidak lagi ditampilkan tanpa ia datang. Bila ia
  belum sempat mengelilingi kapal itu (vonis datang bersamaan dengan
  penyerahan, atau galangan sedang mengejar), ia berkeliling dulu satu
  putaran. Vonis yang sudah menunggu didahulukan dari putaran keliling.
- **Meluncur hanya saat `landed`.** Kapal yang lulus menunggu di doknya dengan
  layar terpasang, berapa pun lamanya dan di urutan mana pun dalam antrean
  merge. Peluncurannya sendiri tidak berubah dari 0.16.0.
- **Jangkar.** Kapal yang sudah lulus tetapi ditahan (`held`) atau dihentikan
  (`stopped`) menurunkan jangkar di sisi haluannya, dan jangkar itu tinggal di
  dermaga dok selama penahanan berlangsung. Begitu dilepas (pertanyaan
  dijawab, `k2 retry`, atau `k2 land` berhasil), jangkar naik lagi dan
  disimpan. Jangkar baru turun sesudah adegan lulusnya selesai (layar sudah
  terpasang). Tiket yang dihentikan sebelum lulus tidak berjangkar.
- **Main dibawa masuk sesudah lulus:** layar tetap terpasang dan Shipwright
  bekerja seperti biasa; penyerahan dan vonis ulangnya tidak punya adegan.
- Balon perasaan (🥳, 😄, 😢), 💬, dan ❌ digambar kira-kira tiga kali lebih besar
  daripada balon tanda ("?", "!", "✓") supaya terbaca dari jarak kamera biasa.
- Mode `?demo` memperlihatkan ketiganya bergiliran: review pertama lulus,
  review kedua ditolak sekali lalu lulus, review ketiga lulus lalu ditahan
  sekitar satu menit sebelum dilepas dan mendarat; begitu seterusnya.

Batas-batasnya:

- Penahanan dan pelepasannya dibaca dari keadaan papan, bukan dari linimasa:
  papan hanya menulis kejadian `held` saat merge ditolak, dan tidak menulis
  apa pun saat penahanan dilepas. Karena itu jangkar naik seketika saat papan
  berubah, walau adegan lain tiket itu masih tertinggal.
- Putaran keliling Inspector juga dibaca dari keadaan (ada reviewer di tiket
  itu), bukan dari kejadian `agent`.
- Urutan vonis menurut kejadian berlaku di antara vonis yang sedang menunggu
  Inspector; vonis yang adegannya sudah ia mulai tidak disela.
- Bentuk jangkar dibuat dari bentuk dasar, bukan model dari ruang pamer.

## Pemeran

| Karakter | Padanan di kerjaan2 |
|---|---|
| Courier | penerima tiket baru (tidak ada agen untuk ini) |
| Naval Architect | planner (menggantikan Draughtsman; karakternya masih yang sama) |
| Foreman | mandor (sesi utama): saat `k2 start` ia menyapa tukang di dok yang disiapkan; ia tidak membawa tiket |
| Shipwright 1–10 | worker; satu tukang per dok, sebanyak dok yang ada. Tukang 5–10 memakai ulang empat model tukang yang ada dengan urutan lain; daftar pemeran bisa digulir |
| Inspector | reviewer |
| Crane operator | merge (`k2 land`). Ia tidak punya derek: derek besar di dekat mercusuar sudah dihapus, dan derek di tiap dok bekerja sendiri |
| Keeper | kotak masuk pemilik |

## Yang sudah punya padanan

| Saat di viewer kanban… | …di galangan |
|---|---|
| Tiket baru muncul (selagi halaman terbuka), termasuk usulan sesudah tiket lain selesai | Perahu rombongan datang dari ujung laut dan berlabuh di dermaga; Courier berjalan ke ujung dermaga, mengambil satu peti, dan menaruh semua tiket rombongan itu di rak ORDERS; perahu pergi ke sisi lain dan menghilang |
| Tiket ada di kolom backlog | Satu gulungan di rak ORDERS |
| Kartu "Planning the backlog" di Control room (planner sedang bekerja) | Naval Architect berdiri di papan pesanan (rak ORDERS) dan membaca tiket; keterangannya adalah langkah terakhir planner. Di luar itu ia di meja DRAWINGS |
| Pertanyaan planner menunggu pemilik | Naval Architect memakai balon "?" di papan pesanan; di antara dua giliran planner ia tetap di sana, diam, sampai semua pertanyaan planner terjawab |
| Tiket pindah backlog → todo (hasil kerja planner) | Naval Architect mengambil gulungan dari papan pesanan dan menjejerkannya di meja todo. Tiket yang pindah hampir bersamaan dibawa dalam satu jalan |
| Tiket ada di kolom todo | Gulungan di meja todo (TODO), berjejer menurut urutan antrean |
| Alasan "starts after X lands" atau "solo" pada tiket todo | Gulungan itu di baris belakang meja, berpita abu-abu; yang siap di baris depan, berpita merah. Begitu tidak lagi menunggu, gulungan bergeser ke baris depan |
| Tiket pindah todo → in_progress (`k2 start`) | Satu dok kosong disiapkan: papan nama tiket dipasang di kepala landasan, Foreman menyapa tukangnya. Gulungan pindah ke urutan depan baris depan meja todo |
| Worker dikirim ke tiket itu | Tukang dok itu menjemput gulungannya dari meja todo dan kembali ke doknya; baru sesudah ia tiba lunas kapal muncul |
| `max_parallel` papan | Jumlah dok (lihat "Dok mengikuti `max_parallel`") |
| Kartu agen "worker" di Control room | Shipwright dok itu memalu lambung; keterangannya adalah langkah terakhir agen dari transkrip. Derek dok itu mengayun satu potong muatan ke atas lambung dan kembali, berulang-ulang, selama worker bekerja |
| Tidak ada agen yang bekerja pada tiket itu (menunggu pemilik, macet, menunggu review, sedang direview) | Derek dok itu diam di tempatnya |
| Kriteria "Done when" tercentang | Derek dok itu meletakkan satu potong di lambung, lalu lambung naik |
| Kriteria "Done when" tercentang, dicabut, atau dibatalkan | Lambung naik atau turun: seperempat sejak lunas diletakkan, sisanya menurut bagian kriteria yang terpenuhi. Kriteria yang dibatalkan dan kriteria `(owner)` tidak dihitung, jadi lambung penuh saat semua bagian worker terpenuhi. Lambung tidak bergerak karena hal lain |
| Uji sedang berjalan (hijau, kuning, merah) | Lampu di tiang dok menyala dengan warna yang sama; Shipwright "testing" |
| Agen macet (stuck) | Shipwright atau Inspector menggeleng dengan balon "?" |
| Pertanyaan menunggu pemilik pada tiket itu | Shipwright duduk menunggu dengan balon "?" |
| Tiket pindah ke review, kartu agen "reviewer" | Shipwright meloncat senang (🥳). Lambung sudah penuh (semua kriteria worker terpenuhi sebelum diserahkan), belum berlayar; Inspector mengelilingi kapal itu (bergiliran bila lebih dari satu) |
| Reviewer menolak | Inspector memberi ❌ kepada Shipwright; Shipwright sedih (😢) lalu kembali bekerja; lambung turun bila ada kriteria yang dicabut |
| Reviewer meluluskan (lencana ⚠ belum di-merge) | Inspector mendekati Shipwright dan bicara singkat; layar dan bendera kapal dipasang; Shipwright senang (😄). Kapal tetap di doknya. Derek dok itu parkir menghadap laut sebelum layar dipasang, dan tetap parkir sampai kapal meluncur |
| Lulus tanpa reviewer (jalur light, `k2 accept`) | Shipwright meloncat senang (🥳), layar dipasang, tanpa Inspector |
| Lulus tetapi ditahan atau dihentikan (held, stopped) | Kapal menunggu di doknya dengan jangkar turun; jangkar naik lagi begitu dilepas |
| Tiket nomor 1 di antrean merge | Crane operator berdiri di dekat haluan kapal itu, di sisi laut doknya |
| Tiket landed → done | Baru saat inilah kapal meluncur: setelah adegan sebelumnya selesai, kapal meluncur di landasan ke air dan berlabuh di teluk; empat kapal terbaru tinggal, yang tertua berlayar pergi |
| Tiket cancel | Tak ada pemeran: tokennya memudar pelan lalu hilang (keputusan 31) |
| "Waiting for you" berisi N butir | N bendera (paling banyak 5) di dekat mercusuar; Keeper memberi isyarat |
| Judul dan nomor tiket | Papan nama di kepala landasan tiap dok; kartu tiket saat kapal atau gulungan diklik |
| Ukuran kontrak (jumlah kriteria) | Ukuran kapal: kecil (≤3), sedang (≤6), besar |
| ID tiket | Macam kapal, satu dari sepuluh corak, tetap sejak lunas di dok sampai berlabuh (lihat "Sepuluh macam kapal") |

## Tukang menjemput tiketnya

Keputusan 27 dan jawaban pemilik di tiket 261113190705.

- `k2 start` hanya menyiapkan dok: papan nama dipasang, Foreman datang dan
  menyapa. Foreman tidak pernah membawa gulungan.
- Tukang baru berangkat saat worker tercatat dikirim (kejadian `agent` dengan
  peran worker). Ia berjalan ke meja todo, mengambil gulungan tiketnya,
  kembali ke doknya, dan sesudah ia tiba lunas diletakkan.
- Bila ada pekerjaan pada tiket tanpa worker yang tercatat (kriteria
  dicentang, dicabut, dibatalkan, tiket diserahkan, atau putusan reviewer),
  galangan menganggap tiketnya sudah dikerjakan: gulungan dijemput dulu, baru
  lambungnya bergerak.
- Halaman yang dibuka di antara `k2 start` dan pengiriman worker menampilkan
  hal yang sama: dok bernama tanpa lambung, gulungan masih di papan. Tandanya
  dibaca dari papan: kejadian terakhir tiket itu masih `started`.
- Bila tukangnya sedang punya tiga pekerjaan antre, adegan jemput dilewati
  dan lunas langsung diletakkan.

## Derek di tiap dok

Keputusan 36 sampai 38 di `docs/galangan-tahap2.md` (tiket 261114001801).
Tiap dok punya satu derek putar klasik berkaki sempit (tapak 0,9) di sudut
timur kepala doknya, tepat di ujung perancah: pilihan F4 dari mockup
`docs/mockups/galangan/derek.html`. Derek besar di dekat mercusuar tidak ada
lagi. Tempat dan geraknya ada di `crane.js`; kapan ia bekerja ditentukan
`craneGoal` (`plan.js`) dan dijalankan `director.js`.

| Keadaan dok | Derek dok itu |
|---|---|
| Dok kosong, atau dok baru disiapkan dan belum ada lunas | parkir: lengan menghadap laut, kait di atas, kosong; tidak bergerak |
| Worker tiket itu sedang bekerja, kapal belum lulus | bekerja: mengangkat satu potong dari tumpukan di atas perancah, mengayunnya pelan ke atas lambung, menahannya di sana, membawanya kembali, lalu mengulang |
| Ada lambung tetapi tidak ada worker yang bekerja (menunggu pemilik, macet, sedang direview) | menyelesaikan gerak yang sedang dilakukan, lalu diam di tempatnya, juga bila masih menggantung muatan |
| Kriteria terpenuhi (kejadian `check`) | mengantar satu potong: muatan diturunkan ke lambung dan diletakkan; baru sesudah itu lambung naik. Potongan itu lalu menyatu dengan lambung |
| Kapal lulus (layar akan dipasang), atau `landed` | parkir: muatan dikembalikan ke tumpukan, lengan menghadap laut. Layar baru dipasang, dan kapal baru meluncur, sesudah derek parkir |

- **Derek tidak pernah berputar lebih dari dari arah laut sampai ke buritan
  kapalnya sendiri** (sekitar 22 derajat). Karena itu lengannya selalu di
  atas doknya sendiri dan pemberatnya di atas jalan: tidak ada yang bisa
  mengenai derek tetangga, layar kapal di dok sebelah, atau tiang kapalnya
  sendiri. Tiang kapal (9,0) lebih tinggi daripada lengan derek (7,6), jadi
  lengan tidak pernah lewat di atas kapal yang layarnya terpasang.
- **Bahan diambil dari tumpukan di atas perancah**, tepat di bawah lengan saat
  parkir, bukan dari tepi jalan seperti di mockup. Ayunan penuh dari tepi
  jalan membuat pemberat derek lewat di atas dok tetangga pada 5 dan 6 dok,
  dan lengannya lewat di atas tiang kapalnya sendiri.
- Satu `check` satu potong, juga bila worker-nya sudah tidak tercatat bekerja
  saat adegan itu diputar. `uncheck` dan `void` tidak memanggil derek. Lunas
  yang baru diletakkan naik tanpa derek.
- Potongan diletakkan di geladak, atau di tepi atas lambung bila lambung
  belum setinggi geladak.
- Bila galangan tertinggal dari papan, derek ikut dipercepat. Bila cerita
  dilepas (tertinggal lebih dari 5 menit) atau halaman baru dibuka, derek di
  dok yang kapalnya sudah lulus langsung parkir.
- Bila jumlah dok berubah, tiap derek ikut doknya dan meneruskan geraknya;
  dok baru mendapat derek yang parkir; derek dari dok yang dibongkar hilang
  bersama doknya.
- Di `?demo` semuanya terlihat: derek bekerja di dok yang worker-nya bekerja,
  mengantar potongan tiap kriteria, diam saat worker bertanya atau macet, dan
  parkir begitu kapal lulus.

Batasnya:

- Tukang yang berjalan ke tempat berdirinya di sisi timur dok lewat sangat
  dekat dengan kaki derek (0,2 sampai 0,45). Tempat berdirinya sendiri bebas.
- Muatan yang diangkat adalah peti dari paket model yang ada; tumpukan di
  perancah selalu tampak berisi satu peti.

## Dok mengikuti `max_parallel`

Keputusan 28. Jumlah dok sama dengan `max_parallel` di `settings.yml`, dan tiap
dok punya satu tukang. Tata letaknya dihitung di `yardOf` (`plan.js`) dan
digambar oleh `setDocks` (`world.js`).

| `max_parallel` | Tata letak |
|---|---|
| 1 sampai 4 | satu baris, jarak antardok seperti galangan lama; 4 dok persis galangan 0.16.0 |
| 5 dan 6 | satu baris, dok lebih rapat; pada 6 pulau melebar sedikit |
| 7 sampai 10 | dua baris: 4+3, 5+3, 5+4, 6+4. Baris belakang digeser setengah langkah, sehingga tiap landasannya lewat di sela dua dok depan sampai ke air |
| lebih dari 10 | tetap 10 dok |

- Pulau ikut membesar. Untuk dua baris deretan gudang dan teras mundur satu
  baris dok, dan di antara dua baris ada jalan kedua. Supaya kapal baris
  belakang bisa lewat di sela dok depan, dok depan direnggangkan, jadi pulau
  melebar: dermaga pos bergeser ke barat, mercusuar ke timur. Pada
  10 dok pulau kira-kira satu setengah kali lebar galangan 4 dok, dan kamera
  "Whole yard" mundur sebanyak itu.
- Papan nama tiket sekarang berdiri di tengah kepala landasan (dulu di sisi
  kiri dok), supaya tidak menghalangi lorong di antara dok.
- Lampu jalan dan peti di antara dok hanya ada bila selanya cukup lebar
  (satu baris, sampai 4 dok).
- **Tiket lebih banyak daripada dok.** Tiket yang hanya menunggu pemilik tidak
  memakai jatah `max_parallel`, dan kapal yang lulus tetap di dok sampai
  landed, jadi tiket berjalan bisa lebih banyak daripada dok. Tiket
  berikutnya menunggu sebagai gulungan di meja todo sampai ada dok kosong;
  kejadiannya tetap dicatat dan lambungnya langsung setinggi yang benar saat
  dok didapat.
- **`max_parallel` berubah selagi halaman terbuka.** Dinaikkan: dok dan tukang
  bertambah, kapal yang ada tetap di doknya (dok bisa pindah tempat karena
  tata letak dihitung ulang; kapal ikut doknya), gulungan yang menunggu
  mendapat dok. Diturunkan: dok dibongkar dari ujung, dan dok yang masih
  berisi kapal tinggal sampai kapalnya pergi, begitu juga dok bernomor lebih
  kecil di depannya; dok di luar jatah tidak menerima tiket baru. Tata letak
  tidak diubah selagi ada kapal yang sedang meluncur. Orang yang sedang
  berjalan saat tata letak berubah menyelesaikan langkahnya ke tempat lama,
  lalu berjalan biasa lagi.
- **Mode demo.** `?demo&docks=6` membuka demo dengan 6 dok (1 sampai 10; tanpa
  `docks` memakai 4). Catatan demo di kiri atas punya tautan 1, 3, 4, 6, 7,
  10. Untuk mengubah jumlah selagi demo berjalan:
  `k2space.demo.setDocks(8)` di konsol peramban.

## Sepuluh macam kapal

Ukuran kapal mengikuti jumlah kriteria; coraknya mengikuti ID tiket. Hash
kecil atas ID (bukan angka ID langsung, karena ID adalah cap waktu yang
berurutan) memilih satu dari sepuluh corak, dan tiap corak berlaku untuk
ketiga ukuran. Karena hanya ID yang dihitung, tiket yang sama mendapat kapal
yang sama di tiap pemuatan halaman dan di tiap perangkat. Aturannya ada di
`liveryOf` (`plan.js`); warnanya di `LIVERY` (`world.js`).

| Corak | Lambung | Layar | Bendera |
|---|---|---|---|
| `white` | biasa | putih | putih |
| `red` | biasa | merah | merah |
| `teal` | biasa | toska | toska |
| `yellow` | biasa | kuning | kuning |
| `blue` | biasa | biru | biru |
| `green` | biasa | hijau | hijau |
| `orange` | biasa | jingga | jingga |
| `purple` | biasa | ungu | ungu |
| `pirate-red` | bajak laut | hitam bertengkorak | merah |
| `pirate-white` | bajak laut | hitam bertengkorak | putih |

- Layar hitam bertengkorak digambar di modelnya dan tidak bisa diwarnai; dua
  kapal bajak laut dibedakan dari benderanya saja.
- Corak baru terlihat penuh setelah tiket lulus (layar dan bendera
  dipasang). Sebelum itu, di dok, hanya bentuk lambung yang membedakan: biasa
  atau bajak laut.
- Mengubah `liveryOf` atau urutan `LIVERIES` mengganti kapal semua tiket di
  semua papan.
- Mode `?demo` memilih ID buatannya sehingga kesepuluh corak muncul
  bergiliran, dengan satu kapal bajak laut di antara yang pertama berlabuh.

## Perencana dan meja todo

Keputusan 26 di `docs/galangan-tahap2.md`, dengan jawaban pemilik atas lima
pertanyaan di tiket 261113190704.

**Kapan si perencana di papan pesanan.** Dua hal dibaca dari keadaan papan,
bukan dari linimasa:

| Keadaan papan | Naval Architect |
|---|---|
| Planner tercatat sedang bekerja (`live.planner`) | di papan pesanan, membaca; keterangannya langkah terakhir planner |
| Planner bekerja dan ada pertanyaannya yang belum terjawab | sama, dengan balon "?" |
| Planner sudah berhenti, pertanyaannya masih menunggu pemilik | tetap di papan pesanan, diam, dengan balon "?" |
| Tidak keduanya | di meja DRAWINGS, mengerjakan pekerjaan pengisi waktu; tidak ke papan pesanan |

- "Pertanyaan planner" adalah pertanyaan yang belum terjawab dan ditulis oleh
  planner sendiri (kejadian `question` yang `by`-nya `planner:…`), pada tiket
  mana pun yang tidak dibatalkan. Pertanyaan worker atau sesi utama tidak
  dihitung. Papan yang ditulis sebelum kerjaan2 mencatat `by` tidak punya
  tanda itu: pertanyaan lamanya tidak memunculkan "?".
- Membawa tiket ke meja todo didahulukan: selama itu ia tidak di papan
  pesanan. Sesudah pertanyaan terakhir terjawab, balon hilang dalam beberapa
  detik.
- Planner yang tidak pernah terlihat berhenti (sesi ditutup di tengah jalan)
  dianggap tidak bekerja lagi setelah `stuck_after_minutes` tanpa tanda
  hidup, sama seperti di Control room.

**Satu jalan untuk serombongan.** Tiket yang kejadian `moved` ke todo-nya tiba
sebelum si perencana meninggalkan papan pesanan ikut dalam jalan yang sama;
yang tiba sesudahnya ikut jalan berikutnya. Di tangannya hanya tampak satu
gulungan, berapa pun yang ia bawa; di meja ia meletakkannya satu per satu.

**Baris depan dan belakang.** Baris belakang berarti "menunggu tiket lain":

- ada `blocked_by` yang belum landed (yang ditampilkan `k2 ready` sebagai
  "starts after … lands"); atau
- ada tiket solo yang sedang berjalan (semua tiket todo menunggu); atau
- tiket itu sendiri solo dan masih ada tiket lain yang mengisi tempat.

Tiket yang dijeda pemilik (pause before) tetap di baris depan: ia menunggu
pemilik, bukan tiket lain. Tiket todo yang belum siap karena hal lain (kontrak
kosong, pertanyaan yang menahan) juga di baris depan. Tiket di belakang tiket
solo yang sedang menunggu tidak ikut dipindah ke baris belakang, walau
`k2 next` belum akan memulainya.

**Batas.** Meja memuat 8 di baris depan dan 8 di baris belakang, masing-masing
menurut urutan antrean; sisanya tidak digambar dan tidak diberi tanda, sampai
ada tempat. Tiket berjalan yang tidak mendapat dok menunggu di baris depan,
sesudah semua tiket todo.

**Demo.** Di `?demo` planner buatan mulai membaca beberapa detik setelah
halaman dibuka, bertanya di giliran pertamanya (dan sesekali sesudahnya),
lalu memindahkan semua pesanan yang sudah waktunya sekaligus; sebagian
dijadwalkan sesudah tiket yang sedang berjalan, jadi baris belakang terisi dan
maju saat tiket itu berlabuh.

## Yang ada di viewer tetapi belum punya padanan

- **Mandor (sesi utama).** Foreman hanya menyapa saat `start`; kegiatan sesi
  utama lainnya tidak terlihat.
- **Tiket todo yang dijeda pemilik** (pause before) atau belum siap:
  gulungannya tampil sama dengan yang siap.
- **Tiket mana yang ditunggu:** baris belakang hanya berkata "menunggu tiket
  lain", tidak menunjuk tiketnya.
- **Main dibawa masuk sebelum merge** (worker atau reviewer dipanggil lagi
  setelah lulus): tampil seperti kerja biasa, layar tetap terpasang.
- **Posisi 2 dan seterusnya di antrean merge:** tidak dibedakan.
- **Jenis butir kotak masuk** (asumsi, cek tangan, follow-up, ditolak dua
  kali, kontrak berubah): semuanya hanya menjadi bendera.
- **Worktree yatim, tiket rusak, giliran uji** (test turn): tidak tampil.
- **Jalur (lane), model, ronde ke berapa:** tidak tampil di adegan; penolakan
  hanya di kartu tiket.
- **Tab History** (lama pengerjaan, tingkat penolakan): tidak ada.
- **Lebih dari yang muat:** tiket berjalan yang tidak mendapat dok menunggu
  sebagai gulungan di meja todo; rak memuat 12 gulungan dan meja todo 8 per
  baris, sisanya tidak digambar dan tidak diberi tanda.

## Usul kelanjutan (belum diputuskan pemilik)

Usul yang pernah dicatat di sini sudah dikerjakan. Yang masih terbuka ada di
`docs/galangan-tahap2.md`, bagian "Belum diputuskan pemilik".
